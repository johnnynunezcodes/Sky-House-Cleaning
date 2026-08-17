// Staff-only: permanently removes a one-off, quote-based, or assessment
// visit from both the calendar and its Firestore assignment doc. Reached
// only from the new Schedule page's Edit Visit form, and only ever for
// those three job types — the Edit form disables this button entirely for
// recurring jobs (see AGENTS.md → "Schedule (split from Jobs)"), since a
// recurring plan's visits already have their own dedicated cancel tools
// (cancel-visit.js / cancel-subscription.js) that also keep Stripe's
// subscription metadata in sync, which a blind calendar-only delete here
// would NOT do.
export const prerender = false;

import { deleteBookingEvent, isConfigured as isCalendarConfigured } from "../../../../lib/googleCalendar.js";
import { getDb } from "../../../../lib/firebaseAdmin.js";
import { isConfigured as isFirebaseConfigured } from "../../../../lib/firebaseAdmin.js";

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

	const { eventId, jobKey } = body || {};
	if (!eventId) {
		return json({ error: "Missing eventId." }, 400);
	}

	try {
		await deleteBookingEvent({ eventId });
	} catch (err) {
		return json({ error: "Couldn't delete the visit: " + err.message }, 500);
	}

	// Non-fatal — the calendar event is already gone (the thing that
	// actually matters), a leftover Firestore doc for a deleted event is
	// just inert clutter, same tolerance every other "calendar succeeded,
	// Firestore cleanup failed" case in this app has.
	if (isFirebaseConfigured() && jobKey) {
		try {
			await getDb().collection("jobAssignments").doc(jobKey).delete();
		} catch (err) {
			return json({ ok: true, warning: "The visit was deleted, but cleaning up its dispatch record failed: " + err.message });
		}
	}

	return json({ ok: true });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
