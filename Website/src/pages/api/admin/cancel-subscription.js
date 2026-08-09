// Staff-only tool to cancel a customer's whole recurring plan — the "they
// called to quit" flow. Customers can't do this themselves (the Stripe
// Customer Portal has self-service cancellation turned off on purpose, so
// minimum-commitment discounts can't be gamed).
//
// Two modes:
//  - immediate: stops billing right now and removes the upcoming calendar
//    visit, since it's being called off. If that visit was already paid
//    for, issue a refund by hand in the Stripe Dashboard if appropriate.
//  - end of period: the already-paid-for upcoming visit still happens as
//    scheduled; no further charges or visits after that. Nothing on the
//    calendar changes.
export const prerender = false;

import Stripe from "stripe";
import { isConfigured as isCalendarConfigured, deleteBookingEvent } from "../../../lib/googleCalendar.js";

export async function POST({ request }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Stripe isn't configured." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { subscriptionId, immediate } = body || {};
	if (!subscriptionId) {
		return json({ error: "A subscription is required." }, 400);
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	let subscription;
	try {
		subscription = await stripe.subscriptions.retrieve(subscriptionId);
	} catch {
		return json({ error: "Couldn't find that subscription." }, 404);
	}

	const metadata = subscription.metadata || {};

	try {
		if (immediate) {
			await stripe.subscriptions.cancel(subscriptionId);

			if (isCalendarConfigured() && metadata.lastEventId) {
				try {
					await deleteBookingEvent({ eventId: metadata.lastEventId });
				} catch (err) {
					// The subscription is already canceled at this point — don't
					// fail the whole request over a calendar cleanup issue, just
					// surface it so staff know to remove the event by hand.
					return json({
						success: true,
						immediate: true,
						warning: "Subscription canceled, but couldn't remove the upcoming calendar event: " + err.message,
					});
				}
			}
		} else {
			await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
		}
	} catch (err) {
		return json({ error: "Couldn't cancel the subscription: " + err.message }, 500);
	}

	return json({ success: true, immediate: Boolean(immediate) });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
