// Staff-only: single-job read for the /admin/jobs/[eventId] detail page —
// the one-event equivalent of list-jobs.js's date-window read. Reuses the
// same jobFromCalendarEvent() transform so the two never drift apart (see
// that function's own comment in src/lib/dispatch.js).
//
// Keyed by the raw Calendar eventId alone, NOT the `${eventId}::${visitDate}`
// jobKey — this endpoint (and its page) used to take the full jobKey, but
// Astro's SSR dynamic-route params don't reliably decodeURIComponent (see
// withastro/astro issue #16313: a `::` encoded as `%3A%3A` in the URL can
// survive `decodeURI`-based param extraction as literal `%3A%3A` rather than
// becoming `::`), so splitting on "::" here was finding nothing and treating
// the whole mangled string as the eventId — a real job would 404 with "this
// job's calendar event no longer exists" even though nothing was wrong with
// it. A bare Calendar eventId has no colons or other characters needing
// percent-encoding in the first place, so keying off it alone sidesteps the
// entire class of bug rather than working around Astro's inconsistency.
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

	const eventId = url.searchParams.get("eventId") || "";
	if (!eventId) {
		return json({ error: "Missing eventId." }, 400);
	}

	let event;
	try {
		event = await getBookingEvent({ eventId });
	} catch (err) {
		// Distinguish "Google said this ID doesn't exist" (a real 404 — the
		// event was actually deleted) from anything else (auth/config/network
		// errors) so a genuine bug doesn't get mislabeled as "deleted" the way
		// a blanket catch here did before — that swallowed error is exactly
		// what made the earlier jobKey-decoding bug so confusing to diagnose.
		const status = err?.code || err?.response?.status;
		if (status === 404) {
			return json({ error: "This job's calendar event no longer exists — it may have been deleted." }, 404);
		}
		return json({ error: "Couldn't reach Google Calendar: " + (err?.message || String(err)) }, 502);
	}

	if (event.status === "cancelled") {
		return json({ error: "This job's calendar event has been cancelled." }, 404);
	}

	try {
		// Recompute the job from the event's CURRENT start time rather than
		// trusting any visitDate a caller might separately track — a recurring
		// plan's event moves forward in place each billing cycle (see
		// dispatch.js's own jobKey() comment), so this always lands on
		// wherever the visit actually is now, with the assignment overlay
		// looked up under that same fresh key.
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
