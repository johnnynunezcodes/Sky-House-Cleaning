// Stripe calls this endpoint directly (not the browser) when a payment
// event happens. We only act on `checkout.session.completed` — that's the
// one moment we know for sure the customer actually paid, which is exactly
// when we want to create the real Google Calendar event. Creating it any
// earlier (e.g. when they click "Continue to Payment") would risk holding a
// slot for someone who abandons checkout.
//
// This endpoint has to be registered in the Stripe Dashboard (or via the
// Stripe CLI for local testing) pointing at
// https://<your-domain>/api/stripe-webhook — see AGENTS.md for the exact
// steps. STRIPE_WEBHOOK_SECRET must be set to the signing secret Stripe
// gives you for that endpoint.
export const prerender = false;

import Stripe from "stripe";
import {
	isConfigured as isCalendarConfigured,
	createBookingEvent,
	createReminderEvent,
	isSlotStillFree,
} from "../../lib/googleCalendar.js";
import { nextVisitWindow } from "../../lib/pricing.js";
import { MINIMUM_COMMITMENT } from "../../lib/policies.js";

function describeService(type, frequency, vehicles) {
	if (type === "deep") return "Deep Cleaning";
	if (type === "moveInOut") return "Move-In / Move-Out Cleaning";
	if (type === "carDetailing") {
		const base = frequency === "monthly" ? "Monthly Detailing Membership" : "One-Time Interior Detail";
		const qty = Number(vehicles) || 1;
		return qty > 1 ? `${base} × ${qty} vehicles` : base;
	}
	const names = {
		oneTime: "One-Time Cleaning",
		weekly: "Weekly Cleaning",
		biweekly: "Bi-Weekly Cleaning",
		monthly: "Monthly Cleaning",
	};
	return names[frequency] || "Cleaning";
}

export async function POST({ request }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

	if (!secretKey || !webhookSecret) {
		// Not configured yet — ack with an error so Stripe's dashboard shows
		// this endpoint is failing, which is the visible signal to finish setup.
		return new Response("Webhook not configured", { status: 500 });
	}

	const signature = request.headers.get("stripe-signature");
	const rawBody = await request.text();

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	let event;
	try {
		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
	} catch (err) {
		return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
	}

	if (event.type === "checkout.session.completed") {
		const session = event.data.object;
		const metadata = session.metadata || {};
		const email = session.customer_details?.email || session.customer_email;

		if (isCalendarConfigured() && metadata.slotStart && metadata.slotEnd) {
			const service = describeService(metadata.type, metadata.frequency, metadata.vehicles);
			const amountPaid = session.amount_total != null ? (session.amount_total / 100).toFixed(2) : null;

			const descriptionLines = [
				`Service: ${service}${metadata.sqft ? ` (${metadata.sqft} sq ft)` : ""}`,
				amountPaid ? `Paid: $${amountPaid}` : null,
				metadata.phone ? `Phone: ${metadata.phone}` : null,
				email ? `Email: ${email}` : null,
				metadata.address ? `Address: ${metadata.address}` : null,
				metadata.access ? `Access: ${metadata.access}` : null,
				metadata.pets ? `Pets: ${metadata.pets}` : null,
				metadata.electricalAccess ? `Electrical Access: ${metadata.electricalAccess}` : null,
				metadata.notes ? `Notes: ${metadata.notes}` : null,
			].filter(Boolean);

			try {
				const createdEvent = await createBookingEvent({
					start: metadata.slotStart,
					end: metadata.slotEnd,
					summary: `Sky House Cleaning — ${metadata.name || "Customer"} — ${service}`,
					description: descriptionLines.join("\n"),
					location: metadata.address || undefined,
					attendeeEmail: email,
				});

				// For subscriptions, remember which calendar event is the "current"
				// one so the staff reschedule tool (src/pages/admin/reschedule.astro)
				// can find and move it later without guessing which event is theirs.
				if (session.mode === "subscription" && session.subscription) {
					try {
						await stripe.subscriptions.update(session.subscription, {
							metadata: { lastEventId: createdEvent.id },
						});
					} catch (err) {
						console.error("Failed to save calendar event id on subscription:", err?.message);
					}
				}
			} catch (err) {
				// Log for now (visible in Vercel's function logs) rather than
				// failing the webhook — retrying won't help if this is a
				// configuration problem, and the payment already succeeded.
				console.error("Failed to create Google Calendar event for booking:", err?.message);
			}
		}
	}

	// Fires on every recurring subscription charge, including the very first
	// one — `billing_reason` is how we tell them apart. Both are handled
	// below now: `subscription_create` (the delayed first charge) only needs
	// the visit-count bookkeeping, since checkout.session.completed already
	// created that first calendar event; `subscription_cycle` (every renewal)
	// needs the bookkeeping *and* the next-visit scheduling.
	if (event.type === "invoice.paid") {
		const invoice = event.data.object;
		const isSubscriptionInvoice =
			(invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_create") &&
			invoice.subscription;

		if (isSubscriptionInvoice) {
			try {
				const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
				const metadata = subscription.metadata || {};
				const metadataPatch = {};

				// Every successful invoice on this subscription represents one
				// visit's worth of billing — the customer paid for it, so it counts
				// toward the membership's minimum-commitment term even if staff
				// later canceled that visit and it was never actually performed
				// (cancel-visit.js's "still charge" cancellation deliberately sets
				// no flag here, for exactly this reason — they paid, it counts).
				// The one exception is `nextVisitCanceled`, set only by
				// cancel-subscription.js's defensive cleanup when a visit's
				// calendar event is removed because it falls on or after a
				// scheduled cancellation date — that invoice isn't expected to
				// ever fire at all, so if timing somehow lets it through anyway,
				// it's excluded rather than counted. Guarded against Stripe's
				// webhook retries (which can redeliver the same event) by never
				// counting the same invoice id twice.
				if (metadata.lastCountedInvoiceId !== invoice.id) {
					if (metadata.nextVisitCanceled === "true") {
						metadataPatch.nextVisitCanceled = "";
					} else {
						const currentCount = parseInt(metadata.completedVisitCount || "0", 10) || 0;
						const newCount = currentCount + 1;
						metadataPatch.completedVisitCount = String(newCount);

						// The moment a customer crosses their plan's minimum-commitment
						// threshold, drop a reminder on the business calendar so Johnny
						// knows it's now fine to approve a cancellation if they ask for
						// one — nothing changes for the customer automatically, they
						// still have to call/email and staff still process it by hand
						// via /admin/reschedule (see "Minimum-commitment tracking" in
						// AGENTS.md — self-cancel was deliberately kept staff-only).
						// `commitmentNotified` guards this to fire exactly once per
						// subscription, even across webhook retries or later cycles.
						const minimumCommitment =
							MINIMUM_COMMITMENT[metadata.type || "standard"]?.[metadata.frequency] ?? null;
						if (
							isCalendarConfigured() &&
							minimumCommitment != null &&
							newCount >= minimumCommitment &&
							metadata.commitmentNotified !== "true"
						) {
							try {
								await createReminderEvent({
									summary: `✅ Minimum commitment met — ${metadata.name || "customer"} (${metadata.frequency})`,
									description: [
										`${metadata.name || "This customer"} has completed ${newCount} of ${minimumCommitment} required ${metadata.frequency} cleanings — their minimum commitment is met.`,
										"They're free to cancel now if they ask. Approve/process it from /admin/reschedule, or see everyone's status at /admin/minimum-commitments.",
										metadata.phone ? `Phone: ${metadata.phone}` : null,
										metadata.address ? `Address: ${metadata.address}` : null,
									]
										.filter(Boolean)
										.join("\n"),
								});
								metadataPatch.commitmentNotified = "true";
							} catch (err) {
								// Don't fail the whole webhook over a reminder — the visit
								// count itself is what actually matters and still gets
								// saved below; this just means the notice needs to be
								// checked for by hand via /admin/minimum-commitments.
								console.error("Failed to create minimum-commitment reminder event:", err?.message);
							}
						}
					}
					metadataPatch.lastCountedInvoiceId = invoice.id;
				}

				// Only look for a *new* visit to schedule on genuine renewals —
				// the very first invoice ("subscription_create") already has its
				// calendar event from checkout.session.completed above.
				if (invoice.billing_reason === "subscription_cycle") {
					// Defense-in-depth: if this invoice's billing period is actually
					// for the visit already on file (e.g. the delayed first charge
					// aligned to the first cleaning date, or the charge right after a
					// staff reschedule/skip re-anchored billing to a new date), skip
					// creating a second calendar event for the same visit. Only
					// proceed when this is genuinely a new period.
					const lastVisitSeconds = metadata.lastVisitStart ? Date.parse(metadata.lastVisitStart) / 1000 : null;
					const alreadyScheduled =
						lastVisitSeconds != null &&
						typeof invoice.period_start === "number" &&
						Math.abs(invoice.period_start - lastVisitSeconds) < 3600;

					if (
						!alreadyScheduled &&
						isCalendarConfigured() &&
						metadata.lastVisitStart &&
						metadata.lastVisitEnd &&
						metadata.frequency
					) {
						const nextWindow = nextVisitWindow(metadata.lastVisitStart, metadata.lastVisitEnd, metadata.frequency);

						if (nextWindow) {
							const service = describeService(metadata.type, metadata.frequency, metadata.vehicles);
							const email = invoice.customer_email || undefined;

							const descriptionLines = [
								`Service: ${service}${metadata.sqft ? ` (${metadata.sqft} sq ft)` : ""}`,
								"Recurring cleaning — billed automatically",
								metadata.phone ? `Phone: ${metadata.phone}` : null,
								email ? `Email: ${email}` : null,
								metadata.address ? `Address: ${metadata.address}` : null,
								metadata.access ? `Access: ${metadata.access}` : null,
								metadata.pets ? `Pets: ${metadata.pets}` : null,
				metadata.electricalAccess ? `Electrical Access: ${metadata.electricalAccess}` : null,
								metadata.notes ? `Notes: ${metadata.notes}` : null,
							].filter(Boolean);

							// Best-effort only — a busy slot doesn't stop the visit from
							// being scheduled (the customer already paid), it just flags
							// it for a human to double check.
							try {
								const stillFree = await isSlotStillFree(nextWindow);
								if (!stillFree) {
									descriptionLines.unshift(
										"⚠️ This time showed as busy on the calendar — please confirm there's no conflict.",
									);
								}
							} catch {
								// ignore — proceed without the freshness check
							}

							const createdEvent = await createBookingEvent({
								start: nextWindow.start,
								end: nextWindow.end,
								summary: `Sky House Cleaning — ${metadata.name || "Customer"} — ${service}`,
								description: descriptionLines.join("\n"),
								location: metadata.address || undefined,
								attendeeEmail: email,
							});

							// Advance the stored "last visit" (and which calendar event is
							// the current one) so the next renewal computes the correct
							// following date, and the staff reschedule tool always finds
							// the right event.
							metadataPatch.lastVisitStart = nextWindow.start;
							metadataPatch.lastVisitEnd = nextWindow.end;
							metadataPatch.lastEventId = createdEvent.id;
						}
					}
				}

				if (Object.keys(metadataPatch).length > 0) {
					await stripe.subscriptions.update(invoice.subscription, {
						metadata: { ...metadata, ...metadataPatch },
					});
				}
			} catch (err) {
				console.error("Failed to process recurring invoice:", err?.message);
			}
		}
	}

	return new Response(JSON.stringify({ received: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}
