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

const REQUIRED_CUSTOMER_FIELDS = ["name", "email", "phone", "address", "access"];

export async function POST({ request }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;

	if (!secretKey) {
		return new Response(
			JSON.stringify({
				error: "Payments aren't configured yet — STRIPE_SECRET_KEY is missing. See AGENTS.md for setup steps.",
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

	const { selections, customer, slot } = body || {};

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
					JSON.stringify({ error: "That time was just booked by someone else — please pick another." }),
					{ status: 409, headers: { "Content-Type": "application/json" } },
				);
			}
		} catch {
			// If the availability check itself fails, don't block checkout on
			// it — worst case a rare double-booking gets sorted out by hand.
		}
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

	// Weekly / bi-weekly / monthly standard cleanings are recurring plans —
	// everything else (one-time, deep clean, move-in/out) is a single charge.
	// Deep/move-in-out never recur even if `frequency` happens to be set,
	// since those service types don't have recurring prices in the matrix.
	const isRecurring = selections?.type === "standard" && isRecurringFrequency(selections?.frequency);
	const recurring = isRecurring ? RECURRING_INTERVALS[selections.frequency] : null;

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
		notes: customer.notes || "",
		slotStart: slot.start,
		slotEnd: slot.end,
		frequency: selections?.frequency || "",
		type: selections?.type || "",
		sqft: String(selections?.sqft || ""),
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
			success_url: `${origin}/book/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${origin}/book/canceled`,
			metadata: bookingMetadata,
			// Subscriptions don't automatically inherit the Checkout Session's
			// metadata, so it's duplicated onto the subscription itself —
			// that's what future `invoice.paid` webhook events read from to
			// know where/when to schedule each recurring visit.
			...(isRecurring && {
				subscription_data: {
					metadata: { ...bookingMetadata, lastVisitStart: slot.start, lastVisitEnd: slot.end },
				},
			}),
		});

		return new Response(JSON.stringify({ url: session.url }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		return new Response(
			JSON.stringify({ error: "We couldn't start payment. Please try again or give us a call." }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
}
