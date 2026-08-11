// Staff-only tool: cancel the next visit AND don't charge for it — as
// opposed to /api/admin/cancel-visit.js, which cancels the visit but still
// bills as normal (for late cancellations). Since billing is anchored to the
// actual cleaning date (see AGENTS.md), "don't charge for the skipped visit"
// means fast-forwarding the whole subscription — calendar and billing both —
// to the following visit's date, using the same interval math the weekly
// webhook renewal uses. The day-of-week/month naturally stays the same as
// before, since skipping by exactly one interval preserves the pattern.
export const prerender = false;

import Stripe from "stripe";
import {
	isConfigured as isCalendarConfigured,
	updateBookingEvent,
	createBookingEvent,
} from "../../../lib/googleCalendar.js";
import { nextVisitWindow } from "../../../lib/pricing.js";

const SERVICE_NAMES = {
	weekly: "Weekly Cleaning",
	biweekly: "Bi-Weekly Cleaning",
	monthly: "Monthly Cleaning",
};

// Monthly Detailing Membership shares the "monthly" frequency string with
// Standard Cleaning's Monthly plan, so SERVICE_NAMES alone can't tell them
// apart — check metadata.type first.
function serviceLabelFor(metadata) {
	if (metadata.type === "carDetailing") {
		const base = metadata.frequency === "monthly" ? "Monthly Detailing Membership" : "One-Time Interior Detail";
		const qty = Number(metadata.vehicles) || 1;
		return qty > 1 ? `${base} × ${qty} vehicles` : base;
	}
	return SERVICE_NAMES[metadata.frequency] || "Recurring Cleaning";
}

// "2020 Honda Civic (Blue)" from whichever of year/make/model/color were
// filled in — null if none were (e.g. every non-carDetailing booking).
function describeVehicle(metadata) {
	const parts = [metadata.vehicleYear, metadata.vehicleMake, metadata.vehicleModel].filter(Boolean).join(" ");
	if (!parts && !metadata.vehicleColor) return null;
	const color = metadata.vehicleColor ? ` (${metadata.vehicleColor})` : "";
	return `${parts}${color}`.trim();
}

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
	if (!metadata.lastVisitStart || !metadata.lastVisitEnd || !metadata.frequency) {
		return json({ error: "This subscription is missing schedule info — can't compute the next visit." }, 400);
	}

	const nextWindow = nextVisitWindow(metadata.lastVisitStart, metadata.lastVisitEnd, metadata.frequency);
	if (!nextWindow) {
		return json({ error: "Couldn't compute the following visit's date." }, 500);
	}

	const service = serviceLabelFor(metadata);
	const vehicle = describeVehicle(metadata);
	const descriptionLines = [
		`Service: ${service}${metadata.sqft ? ` (${metadata.sqft} sq ft)` : ""}`,
		"Recurring cleaning — resumes after a skipped, unbilled visit",
		metadata.phone ? `Phone: ${metadata.phone}` : null,
		metadata.address ? `Address: ${metadata.address}` : null,
		vehicle ? `Vehicle: ${vehicle}` : null,
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
				// Move the currently-scheduled (about to be skipped) event
				// forward to the following visit's date, rather than deleting
				// and recreating — the net effect is the same (nothing left on
				// the skipped date, something on the next one).
				await updateBookingEvent({ eventId, start: nextWindow.start, end: nextWindow.end });
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
			const created = await createBookingEvent({
				start: nextWindow.start,
				end: nextWindow.end,
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
				lastVisitStart: nextWindow.start,
				lastVisitEnd: nextWindow.end,
				lastEventId: eventId,
			},
		});
	} catch (err) {
		return json(
			{ error: "The calendar was updated, but saving the new schedule to Stripe failed: " + err.message },
			500,
		);
	}

	// Re-anchor billing to the following visit's date so the skipped cycle is
	// never invoiced at all — proration_behavior: "none" means no charge
	// happens for the gap either.
	let billingWarning = null;
	try {
		await stripe.subscriptions.update(subscriptionId, {
			trial_end: Math.floor(new Date(nextWindow.start).getTime() / 1000),
			proration_behavior: "none",
		});
	} catch (err) {
		billingWarning =
			"The visit was skipped on the calendar, but pushing back the billing date failed — the customer may still be charged for the skipped visit: " +
			err.message;
	}

	return json({
		success: true,
		newVisitStart: nextWindow.start,
		newVisitEnd: nextWindow.end,
		warning: billingWarning || undefined,
	});
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
