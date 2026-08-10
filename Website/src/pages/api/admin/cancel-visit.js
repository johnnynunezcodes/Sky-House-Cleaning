// Staff-only tool to cancel a single upcoming visit while still charging for
// it — e.g. a late cancellation that the plan's policy says still bills. The
// recurring plan keeps billing and scheduling normally afterward: this only
// removes the one calendar event and clears the subscription's
// `lastEventId`, without touching `lastVisitStart`/`lastVisitEnd`, so the
// next renewal still computes the correct following date exactly as if this
// visit had happened.
//
// The customer is still charged for this visit, so it counts toward the
// membership's minimum commitment the same as any other billed visit — no
// flag needed here; stripe-webhook.js increments `completedVisitCount` for
// every paid invoice by default. (Contrast with skip-visit.js, which cancels
// *and* skips the charge — that invoice never happens in the first place, so
// it's naturally excluded with no bookkeeping needed either.)
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

	const { subscriptionId } = body || {};
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

	if (isCalendarConfigured() && metadata.lastEventId) {
		try {
			await deleteBookingEvent({ eventId: metadata.lastEventId });
		} catch (err) {
			return json({ error: "Couldn't remove the calendar event: " + err.message }, 500);
		}
	}

	try {
		await stripe.subscriptions.update(subscriptionId, {
			metadata: { ...metadata, lastEventId: "" },
		});
	} catch (err) {
		return json(
			{ error: "The calendar event was removed, but updating Stripe failed: " + err.message },
			500,
		);
	}

	return json({ success: true });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
