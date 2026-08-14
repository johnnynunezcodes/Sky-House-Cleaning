// Server-side checkout endpoint. This runs on-demand (not statically built —
// see `prerender = false` below), which is why the site needs a hosting
// adapter (@astrojs/vercel, configured in astro.config.mjs) instead of the
// default static output.
//
// Requires the STRIPE_SECRET_KEY environment variable to be set (in Vercel
// project settings for production, and in a local .env file for `astro dev`).
// See the setup notes in AGENTS.md for how to get this key from Stripe.
export const prerender = false;

import Stripe from "stripe";
import { calculatePrice, RECURRING_INTERVALS, isRecurringFrequency } from "../../lib/pricing.js";
import { isConfigured as isCalendarConfigured, isSlotStillFree } from "../../lib/googleCalendar.js";
import { policyFor } from "../../lib/policies.js";

const REQUIRED_CUSTOMER_FIELDS = ["name", "email", "phone", "address", "access"];

export async function POST({ request }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;

	if (!secretKey) {
		return new Response(
			JSON.stringify({
				error: "Payments aren't configured yet. STRIPE_SECRET_KEY is missing. See AGENTS.md for setup steps.",
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid request body." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { selections, customer, slot, policyAgreed, pendingBookingId } = body || {};

	const missingField = REQUIRED_CUSTOMER_FIELDS.find((field) => !customer?.[field]);
	if (missingField) {
		return new Response(JSON.stringify({ error: "Please fill in all required fields." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!slot?.start || !slot?.end) {
		return new Response(JSON.stringify({ error: "Please pick a date and time." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Close the small race window between two people picking the same slot —
	// only worth checking if Calendar is actually wired up.
	if (isCalendarConfigured()) {
		try {
			const stillFree = await isSlotStillFree(slot);
			if (!stillFree) {
				return new Response(
					JSON.stringify({ error: "That time was just booked by someone else. Please pick another." }),
					{ status: 409, headers: { "Content-Type": "application/json" } },
				);
			}
		} catch {
			// If the availability check itself fails, don't block checkout on
			// it — worst case a rare double-booking gets sorted out by hand.
		}
	}

	// Which policy governs this booking is re-derived server-side from
	// `selections`, the same way price is — never trust the `policyPath`/
	// `policyLabel` strings the client sent, only whether they actually
	// checked the box (`policyAgreed`). If a booking type has no matching
	// policy (shouldn't happen for anything sold through this form), we don't
	// block checkout on it.
	const policy = policyFor({ type: selections?.type, frequency: selections?.frequency });
	if (policy && policyAgreed !== true) {
		return new Response(
			JSON.stringify({ error: "Please confirm you've read and agree to the booking policy before continuing." }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	// The price is always re-derived here from the site's own pricing data —
	// `selections` (and any dollar amounts inside it) coming from the browser
	// are never trusted directly. This guarantees the amount charged always
	// matches what the pricing configurator actually offers, regardless of
	// what a client sends.
	const { total, lineItems } = calculatePrice(selections);

	if (!total || total <= 0) {
		return new Response(JSON.stringify({ error: "Couldn't calculate a price for this booking." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
	const origin = new URL(request.url).origin;

	// Weekly / bi-weekly / monthly standard cleanings are recurring plans, and
	// so is a Monthly Detailing Membership (Interior Car Detailing only offers
	// "oneTime" or "monthly", never weekly/bi-weekly). Everything else
	// (one-time cleaning, deep clean, move-in/out, one-time detailing) is a
	// single charge — deep/move-in-out never recur even if `frequency` happens
	// to be set, since those service types don't have recurring prices in the
	// matrix.
	const isRecurring =
		(selections?.type === "standard" || selections?.type === "carDetailing") &&
		isRecurringFrequency(selections?.frequency);
	const recurring = isRecurring ? RECURRING_INTERVALS[selections.frequency] : null;

	// Every line item is included in the Checkout Session and marked recurring
	// when this is a subscription — including add-ons — so the Checkout page
	// shows the customer their real per-visit total, and so add-ons genuinely
	// keep billing (and getting done) every cleaning, not just the first one.
	// That's a deliberate choice, not a default: an oven or blinds add-on
	// picked on a recurring plan means "clean that every time," matching what
	// customers actually expect from a standing add-on on a weekly/bi-weekly/
	// monthly plan. `PricingConfigurator.astro` states this plainly in the
	// add-ons section and next to the price before checkout.

	// Everything here rides along as metadata so the webhook
	// (src/pages/api/stripe-webhook.js) can create the real calendar event(s)
	// once payment actually succeeds — the first calendar event is never
	// created before that point, so an abandoned checkout never holds a slot.
	const bookingMetadata = {
		name: customer.name,
		phone: customer.phone,
		address: customer.address,
		access: customer.access,
		pets: customer.pets || "",
		electricalAccess: customer.electricalAccess || "",
		vehicleYear: customer.vehicleYear || "",
		vehicleMake: customer.vehicleMake || "",
		vehicleModel: customer.vehicleModel || "",
		vehicleColor: customer.vehicleColor || "",
		notes: customer.notes || "",
		slotStart: slot.start,
		slotEnd: slot.end,
		frequency: selections?.frequency || "",
		type: selections?.type || "",
		sqft: String(selections?.sqft || ""),
		vehicles: selections?.type === "carDetailing" ? String(selections?.vehicles || 1) : "",
		// Durable, auditable record that the customer actually agreed to the
		// specific policy version in force at checkout time — the checkbox
		// state itself lives only in the browser, so this is what proves
		// consent happened if it's ever disputed.
		policyPath: policy?.path || "",
		policyLabel: policy?.label || "",
		policyAgreedAt: policy ? new Date().toISOString() : "",
		// Only set for phone bookings that went through /confirm/[id].astro —
		// lets stripe-webhook.js mark the pendingBooking doc "converted" at the
		// one moment that actually matters (real payment confirmation), instead
		// of at session-creation time. See finalize-pending-booking.js.
		pendingBookingId: pendingBookingId || "",
	};

	try {
		const session = await stripe.checkout.sessions.create({
			mode: isRecurring ? "subscription" : "payment",
			customer_email: customer.email,
			line_items: lineItems.map((line) => ({
				price_data: {
					currency: "usd",
					product_data: { name: line.label },
					unit_amount: Math.round(line.amount * 100),
					...(recurring && {
						recurring: { interval: recurring.interval, interval_count: recurring.interval_count },
					}),
				},
				quantity: 1,
			})),
			success_url: `${origin}/schedule/success?session_id={CHECKOUT_SESSION_ID}`,
			// Stripe's own "‹ Back" link on the Checkout page (not the browser's
			// back button) sends the customer here. For a phone booking, sending
			// them to the generic public /schedule/canceled page would be wrong —
			// its "Back to Booking" link points at /booking, a page this customer
			// never touched, and they'd have no way to get back to their actual
			// booking without calling in again. So a phone booking's cancel_url
			// instead points right back at the same /confirm/[id] page they came
			// from, which (per finalize-pending-booking.js) is still "pending" and
			// ready to retry — the generic canceled page's promise of "pick up
			// right where you left off" is only literally true for this path.
			cancel_url: pendingBookingId ? `${origin}/confirm/${pendingBookingId}` : `${origin}/schedule/canceled`,
			metadata: bookingMetadata,
			// Subscriptions don't automatically inherit the Checkout Session's
			// metadata, so it's duplicated onto the subscription itself —
			// that's what future `invoice.paid` webhook events read from to
			// know where/when to schedule each recurring visit.
			...(isRecurring && {
				subscription_data: {
					// `completedVisitCount` tracks progress toward the membership's
					// minimum-commitment term (see the Policies vault and
					// stripe-webhook.js) — starts at 0 and is incremented there each
					// time a visit is actually billed, not just scheduled.
					metadata: {
						...bookingMetadata,
						lastVisitStart: slot.start,
						lastVisitEnd: slot.end,
						completedVisitCount: "0",
					},
					// Bill on the day of the actual first cleaning, not the day
					// they signed up — `proration_behavior: "none"` means no
					// invoice is generated at all until that date (not even a
					// $0 one), so this doesn't create any duplicate-charge risk
					// with the renewal logic in stripe-webhook.js. Every
					// following charge then follows the same cadence from this
					// anchor, so it naturally keeps landing on the cleaning day.
					billing_cycle_anchor: Math.max(
						Math.floor(new Date(slot.start).getTime() / 1000),
						Math.floor(Date.now() / 1000) + 60,
					),
					proration_behavior: "none",
				},
			}),
		});

		// `sessionId` alongside `url` is additive — every existing caller only
		// ever reads `data.url`, so this can't break them. It exists so
		// /api/confirm/finalize-pending-booking.js (which calls this handler
		// directly rather than duplicating this logic) can record which Stripe
		// session a pendingBooking actually turned into.
		return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		// Always log the real reason server-side (visible in Vercel's function
		// logs) even though the customer only ever sees the generic message
		// below — a raw Stripe error isn't something to show a customer, but
		// we still need to be able to see it ourselves to debug.
		console.error("Checkout session creation failed:", err?.message, err?.raw?.message);
		return new Response(
			JSON.stringify({ error: "We couldn't start payment. Please try again or give us a call." }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
}
