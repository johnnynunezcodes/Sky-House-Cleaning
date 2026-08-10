// Staff-only tool to cancel a customer's whole recurring plan — the "they
// called to quit" flow. Customers can't do this themselves (the Stripe
// Customer Portal has self-service cancellation turned off on purpose, so
// minimum-commitment discounts can't be gamed).
//
// Two modes:
//  - immediate: stops billing right now and removes the upcoming calendar
//    visit, since it's being called off. If that visit was already paid
//    for, issue a refund by hand in the Stripe Dashboard if appropriate.
//  - on a date: staff pick exactly when the plan should stop. Visits keep
//    billing normally, right on schedule, up through that date; nothing
//    after it.
//
// This used to offer a simpler "after current period" mode using Stripe's
// `cancel_at_period_end`. That was wrong for this app: because billing is
// anchored to each visit's actual cleaning date (see AGENTS.md), the
// subscription's "current period" boundary IS the next unbilled visit's
// charge date — so `cancel_at_period_end` canceled the plan *before* that
// next charge ever fired, silently skipping the visit everyone assumed
// would still happen and get paid for. Using an explicit `cancel_at`
// timestamp instead lets staff choose precisely how many more visits should
// still bill before the plan stops.
export const prerender = false;

import Stripe from "stripe";
import {
	isConfigured as isCalendarConfigured,
	deleteBookingEvent,
	zonedTimeToUtc,
} from "../../../lib/googleCalendar.js";

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

	const { subscriptionId, immediate, cancelDate, cancelTime } = body || {};
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

	if (immediate) {
		try {
			await stripe.subscriptions.cancel(subscriptionId);
		} catch (err) {
			return json({ error: "Couldn't cancel the subscription: " + err.message }, 500);
		}

		if (isCalendarConfigured() && metadata.lastEventId) {
			try {
				await deleteBookingEvent({ eventId: metadata.lastEventId });
			} catch (err) {
				// The subscription is already canceled at this point — don't fail
				// the whole request over a calendar cleanup issue, just surface it
				// so staff know to remove the event by hand.
				return json({
					success: true,
					immediate: true,
					warning: "Subscription canceled, but couldn't remove the upcoming calendar event: " + err.message,
				});
			}

			// Clear the stale reference now that the event is gone, so nothing
			// else ever mistakes it for a live event and tries to update it.
			try {
				await stripe.subscriptions.update(subscriptionId, {
					metadata: { ...metadata, lastEventId: "" },
				});
			} catch {
				// Non-critical — the subscription and calendar are already in the
				// right state; this just tidies up the metadata.
			}
		}

		return json({ success: true, immediate: true });
	}

	// "Cancel on a date" mode.
	if (!/^\d{4}-\d{2}-\d{2}$/.test(cancelDate || "") || !/^\d{2}:\d{2}$/.test(cancelTime || "")) {
		return json({ error: "A cancellation date and time are required." }, 400);
	}

	const [hour, minute] = cancelTime.split(":").map(Number);
	const cancelAt = zonedTimeToUtc(cancelDate, hour, minute, "America/Los_Angeles");
	if (cancelAt.getTime() <= Date.now()) {
		return json({ error: "Pick a cancellation date in the future." }, 400);
	}

	try {
		// proration_behavior: "none" avoids a surprise partial-period charge or
		// credit if the chosen date doesn't land exactly on a future visit's
		// date — the plan simply stops there with no extra invoice.
		await stripe.subscriptions.update(subscriptionId, {
			cancel_at: Math.floor(cancelAt.getTime() / 1000),
			proration_behavior: "none",
		});
	} catch (err) {
		return json({ error: "Couldn't schedule the cancellation: " + err.message }, 500);
	}

	// If the chosen date lands on or before the currently-scheduled next
	// visit, that visit will never actually be billed under the new
	// cancellation date — so its calendar event (already created, e.g. at
	// booking or by a staff reschedule) would otherwise sit there with
	// nobody paying for it. Clean it up automatically.
	let warning;
	let note;
	const lastVisitMs = metadata.lastVisitStart ? Date.parse(metadata.lastVisitStart) : null;
	if (isCalendarConfigured() && metadata.lastEventId && lastVisitMs != null && cancelAt.getTime() <= lastVisitMs) {
		try {
			await deleteBookingEvent({ eventId: metadata.lastEventId });
			note =
				"The already-scheduled visit on the calendar won't be billed under this cancellation date, so it was removed too.";

			// Clear the stale reference now that the event is gone, so no
			// other tool later mistakes it for a live event and tries to
			// "update" a deleted one instead of creating a fresh one.
			// `nextVisitCanceled` is belt-and-suspenders here — this visit's
			// invoice should never actually fire once cancel_at is at or
			// before it, but if timing ever allows it through, this stops it
			// from counting toward the minimum commitment.
			try {
				await stripe.subscriptions.update(subscriptionId, {
					metadata: { ...metadata, lastEventId: "", nextVisitCanceled: "true" },
				});
			} catch {
				// Non-critical — the calendar's already in the right state;
				// this just tidies up the metadata.
			}
		} catch (err) {
			warning =
				"Cancellation scheduled, but the upcoming visit on the calendar won't be billed under this date and couldn't be removed automatically: " +
				err.message;
		}
	}

	return json({ success: true, immediate: false, cancelAt: cancelAt.toISOString(), warning, note });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
