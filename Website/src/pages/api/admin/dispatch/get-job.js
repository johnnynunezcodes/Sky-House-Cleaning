// Staff-only: single-job read for the /admin/jobs/[jobKey] detail page —
// the one-event equivalent of list-jobs.js's date-window read. Reuses the
// same jobFromCalendarEvent() transform so the two never drift apart (see
// that function's own comment in src/lib/dispatch.js).
export const prerender = false;

import { getBookingEvent, isConfigured as calendarConfigured } from "../../../../lib/googleCalendar.js";
import { getJobAssignments, jobFromCalendarEvent } from "../../../../lib/dispatch.js";
import { isConfigured as firebaseConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!calendarConfigured()) {
		return json({ error: "Google Calendar isn't configured yet. See AGENTS.md." }, 500);
	}
	if (!firebaseConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const key = url.searchParams.get("jobKey") || "";
	// jobKey is `${eventId}::${visitDate}` (see dispatch.js's jobKey()).
	// Calendar event IDs never contain "::" (Google's IDs are lowercase
	// base32hex), so splitting on the last occurrence is safe and doesn't
	// need the visitDate half at all — the fresh event's own start time is
	// the source of truth for that (see below).
	const sepIndex = key.lastIndexOf("::");
	const eventId = sepIndex === -1 ? key : key.slice(0, sepIndex);
	if (!eventId) {
		return json({ error: "Missing jobKey." }, 400);
	}

	try {
		let event;
		try {
			event = await getBookingEvent({ eventId });
		} catch {
			return json({ error: "This job's calendar event no longer exists — it may have been deleted." }, 404);
		}
		if (event.status === "cancelled") {
			return json({ error: "This job's calendar event has been cancelled." }, 404);
		}

		// Recompute the job from the event's CURRENT start time rather than
		// trusting the visitDate half of the requested jobKey — a recurring
		// plan's event moves forward in place each billing cycle (see
		// dispatch.js's own jobKey() comment), so a bookmarked/stale link
		// should land on wherever the visit actually is now, with the
		// assignment overlay looked up under that same fresh key, not
		// whatever key the link happened to encode when it was generated.
		const job = jobFromCalendarEvent(event);
		const assignments = await getJobAssignments([job.jobKey]);
		const merged = { ...job, ...assignments.get(job.jobKey) };

		return json({ job: merged });
	} catch (err) {
		return json({ error: "Couldn't load this job: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
