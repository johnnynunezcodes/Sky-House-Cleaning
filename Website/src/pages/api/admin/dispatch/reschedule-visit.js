// Staff-only: moves a single visit's date/time from the new Schedule page's
// Edit Visit form. Deliberately generic and NOT subscription-aware — the
// caller (schedule.astro) only ever sends this for one-off, quote-based, or
// assessment visits, never a recurring plan's visit. A recurring visit's
// date/time is intentionally routed to /admin/reschedule instead (see
// AGENTS.md → "Schedule (split from Jobs)" for why): moving it here would
// leave the Stripe subscription's own stored lastVisitStart/lastVisitEnd
// pointing at the old time, silently breaking the next auto-renewal's date
// math and the billing-date realignment reschedule-subscription.js does
// correctly. This endpoint only ever touches the calendar event itself.
export const prerender = false;

import { updateBookingEvent, isConfigured as isCalendarConfigured, zonedTimeToUtc } from "../../../../lib/googleCalendar.js";
import { jobKey, getJobAssignments, upsertJobAssignment } from "../../../../lib/dispatch.js";
import { isConfigured as isFirebaseConfigured } from "../../../../lib/firebaseAdmin.js";

const TIME_ZONE = "America/Los_Angeles";

export async function POST({ request }) {
	if (!isCalendarConfigured()) {
		return json({ error: "Google Calendar isn't configured yet. See AGENTS.md." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { eventId, oldVisitDate, date, startTime, endTime } = body || {};
	if (!eventId) {
		return json({ error: "Missing eventId." }, 400);
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
		return json({ error: "Please pick a valid date." }, 400);
	}
	if (!/^\d{2}:\d{2}$/.test(startTime || "") || !/^\d{2}:\d{2}$/.test(endTime || "")) {
		return json({ error: "Please pick a valid start and end time." }, 400);
	}

	const [startHour, startMinute] = startTime.split(":").map(Number);
	const [endHour, endMinute] = endTime.split(":").map(Number);
	const start = zonedTimeToUtc(date, startHour, startMinute, TIME_ZONE);
	const end = zonedTimeToUtc(date, endHour, endMinute, TIME_ZONE);
	if (end <= start) {
		return json({ error: "End time must be after the start time." }, 400);
	}

	try {
		await updateBookingEvent({ eventId, start: start.toISOString(), end: end.toISOString() });
	} catch (err) {
		return json({ error: "Couldn't move the visit: " + err.message }, 500);
	}

	// jobKey is `${eventId}::${visitDate}` (see dispatch.js) — moving a visit
	// to a DIFFERENT date changes that key even though the calendar event's
	// own identity (eventId) didn't change. Without this migration, the
	// visit would silently lose its team assignment/status/notes/archived
	// flag on next load (a fresh key reads back as an all-default doc) —
	// unlike a recurring plan's natural cycle-to-cycle move, this is a
	// one-off manual edit, so the whole point is to CARRY the assignment
	// forward, not reset it. Same-day time-only edits skip this entirely
	// since the key doesn't change.
	if (isFirebaseConfigured() && oldVisitDate && oldVisitDate !== date) {
		try {
			const oldKey = jobKey(eventId, oldVisitDate);
			const newKey = jobKey(eventId, date);
			const oldAssignment = (await getJobAssignments([oldKey])).get(oldKey);
			await upsertJobAssignment(newKey, {
				eventId,
				visitDate: date,
				assignedCleanerIds: oldAssignment?.assignedCleanerIds || [],
				status: oldAssignment?.status || "unassigned",
				dispatchNotes: oldAssignment?.dispatchNotes || "",
				cleanerConfirmed: oldAssignment?.cleanerConfirmed || false,
				archived: oldAssignment?.archived || false,
			});
		} catch (err) {
			// The calendar itself already moved successfully at this point —
			// surface this as a warning, not a failure, same tolerance every
			// other "calendar succeeded, Firestore follow-up failed" case in
			// this app has.
			return json({
				ok: true,
				start: start.toISOString(),
				end: end.toISOString(),
				warning: "The visit moved, but carrying over its team/status assignment failed: " + err.message,
			});
		}
	}

	return json({ ok: true, start: start.toISOString(), end: end.toISOString() });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
