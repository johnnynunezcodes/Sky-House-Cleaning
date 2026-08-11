// Staff-only tool for permanently shifting a recurring plan's day/time —
// e.g. moving a customer from Tuesdays to Wednesdays going forward. This is
// deliberately separate from a one-time reschedule: for a single rescheduled
// visit that should revert back afterward, just edit that one event directly
// in Google Calendar — nothing here needs to be touched, since the
// subscription's stored schedule (lastVisitStart/lastVisitEnd) is what
// future visits compute from, not whatever the calendar event was moved to.
//
// This endpoint updates that stored schedule *and* moves the customer's
// current upcoming event to match, so the change takes effect immediately
// and every following visit continues from the new day/time.
export const prerender = false;

import Stripe from "stripe";
import {
	isConfigured as isCalendarConfigured,
	updateBookingEvent,
	createBookingEvent,
	isSlotStillFree,
	zonedTimeToUtc,
} from "../../../lib/googleCalendar.js";
import { durationForType } from "../../../data/booking.js";

const SERVICE_NAMES = {
	weekly: "Weekly Cleaning",
	biweekly: "Bi-Weekly Cleaning",
	monthly: "Monthly Cleaning",
};

export async function POST({ request }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Stripe isn't configured." }, 500);
	}
	if (!isCalendarConfigured()) {
		return json({ error: "Google Calendar isn't configured." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { subscriptionId, date, time, force } = body || {};
	if (!subscriptionId || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) {
		return json({ error: "A subscription, date, and time are all required." }, 400);
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	let subscription;
	try {
		subscription = await stripe.subscriptions.retrieve(subscriptionId);
	} catch {
		return json({ error: "Couldn't find that subscription." }, 404);
	}

	const metadata = subscription.metadata || {};
	const [hour, minute] = time.split(":").map(Number);
	const start = zonedTimeToUtc(date, hour, minute, "America/Los_Angeles");
	const durationMinutes = durationForType(metadata.type);
	const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

	if (!force) {
		try {
			const stillFree = await isSlotStillFree({ start: start.toISOString(), end: end.toISOString() });
			if (!stillFree) {
				return json(
					{ error: "That time already has something else on the calendar.", conflict: true },
					409,
				);
			}
		} catch {
			// If the availability check itself fails, don't block the reschedule.
		}
	}

	const service = SERVICE_NAMES[metadata.frequency] || "Recurring Cleaning";
	const descriptionLines = [
		`Service: ${service}${metadata.sqft ? ` (${metadata.sqft} sq ft)` : ""}`,
		"Recurring cleaning — rescheduled by staff",
		metadata.phone ? `Phone: ${metadata.phone}` : null,
		metadata.address ? `Address: ${metadata.address}` : null,
		metadata.access ? `Access: ${metadata.access}` : null,
		metadata.pets ? `Pets: ${metadata.pets}` : null,
		metadata.electricalAccess ? `Electrical Access: ${metadata.electricalAccess}` : null,
		metadata.notes ? `Notes: ${metadata.notes}` : null,
	].filter(Boolean);

	let eventId = metadata.lastEventId || null;

	try {
		let moved = false;
		if (eventId) {
			try {
				// Move the existing event rather than replacing it, so it keeps
				// its history/any attendee response instead of becoming a new
				// event.
				await updateBookingEvent({ eventId, start: start.toISOString(), end: end.toISOString() });
				moved = true;
			} catch {
				// The stored event id points at something that's already gone
				// (e.g. deleted by an earlier cancellation, or by hand in
				// Calendar) — fall back to creating a fresh event below rather
				// than failing the whole request over a stale reference.
				moved = false;
			}
		}
		if (!moved) {
			// Also covers older subscriptions from before this tool existed,
			// which won't have a stored event id at all.
			const created = await createBookingEvent({
				start: start.toISOString(),
				end: end.toISOString(),
				summary: `Sky House Cleaning — ${metadata.name || "Customer"} — ${service}`,
				description: descriptionLines.join("\n"),
				location: metadata.address || undefined,
			});
			eventId = created.id;
		}
	} catch (err) {
		return json({ error: "Couldn't update the calendar event: " + err.message }, 500);
	}

	try {
		await stripe.subscriptions.update(subscriptionId, {
			metadata: {
				...metadata,
				lastVisitStart: start.toISOString(),
				lastVisitEnd: end.toISOString(),
				lastEventId: eventId,
			},
		});
	} catch (err) {
		return json(
			{ error: "The calendar was updated, but saving the new schedule to Stripe failed: " + err.message },
			500,
		);
	}

	// Keep billing glued to the cleaning date, not just the calendar/metadata.
	// Stripe only allows moving an *existing* subscription's billing date to
	// an arbitrary future timestamp via the `trial_end` mechanism (setting a
	// future billing_cycle_anchor directly is only possible at creation) —
	// this briefly shows the subscription as "Trialing" in the Stripe
	// Dashboard until that date, which is expected and harmless.
	// proration_behavior: "none" means no surprise charge happens right now.
	let billingWarning = null;
	try {
		await stripe.subscriptions.update(subscriptionId, {
			trial_end: Math.floor(start.getTime() / 1000),
			proration_behavior: "none",
		});
	} catch (err) {
		billingWarning = "Calendar and schedule were updated, but re-aligning the billing date failed: " + err.message;
	}

	return json({
		success: true,
		newVisitStart: start.toISOString(),
		newVisitEnd: end.toISOString(),
		warning: billingWarning || undefined,
	});
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
