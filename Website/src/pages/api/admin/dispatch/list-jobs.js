// Staff-only: the dispatch board's main read — merges real calendar events
// (the schedule) with their Firestore assignment overlay (who's assigned,
// what status) for a date range. See src/lib/dispatch.js for why the two
// are kept separate rather than duplicated into one Firestore collection.
export const prerender = false;

import {
	listEvents,
	zonedTimeToUtc,
	isConfigured as calendarConfigured,
} from "../../../../lib/googleCalendar.js";
import { getJobAssignments, jobKey } from "../../../../lib/dispatch.js";
import { isConfigured as firebaseConfigured } from "../../../../lib/firebaseAdmin.js";

const TIME_ZONE = "America/Los_Angeles";

// "YYYY-MM-DD" for `date` (already local wall-clock, no conversion needed)
// vs. the equivalent for an arbitrary UTC instant, in the business's time
// zone — used to figure out which visit-date bucket a calendar event's
// start time actually falls in locally, not whatever the server's own time
// zone happens to be.
function isoDateInTimeZone(date, timeZone = TIME_ZONE) {
	return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
		date,
	);
}

export async function GET({ url }) {
	if (!calendarConfigured()) {
		return json({ error: "Google Calendar isn't configured yet. See AGENTS.md." }, 500);
	}
	if (!firebaseConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const dateStr = url.searchParams.get("date") || isoDateInTimeZone(new Date());
	// Capped at 120 (was 31, back when Month view — the widest existing
	// caller — was the only thing that needed more than a week). The
	// /admin/jobs List view now asks for a ~90-day rolling window (30 days
	// back, 60 forward) to compute its "past 30 days" / "next 30 days"
	// overview stats in one read.
	const days = Math.max(1, Math.min(120, parseInt(url.searchParams.get("days") || "1", 10) || 1));

	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return json({ error: "Invalid date." }, 400);
	}

	try {
		const windowStart = zonedTimeToUtc(dateStr, 0, 0, TIME_ZONE);
		const windowEnd = new Date(windowStart.getTime() + days * 24 * 60 * 60 * 1000);

		const events = await listEvents({ timeMin: windowStart.toISOString(), timeMax: windowEnd.toISOString() });

		const jobs = events.map((event) => {
			const start = event.start?.dateTime || event.start?.date;
			const end = event.end?.dateTime || event.end?.date;
			const visitDate = isoDateInTimeZone(new Date(start));
			// Staff-only fields (amountPaid, jobType, clientName) live in
			// extendedProperties.private, set at booking time by
			// stripe-webhook.js — see the comment on createBookingEvent() in
			// googleCalendar.js for why that's the right place for anything
			// that shouldn't be visible to cleaners even with calendar access.
			// Events created before this existed simply won't have these —
			// callers should treat empty string as "not known," not an error.
			const priv = event.extendedProperties?.private || {};
			return {
				eventId: event.id,
				jobKey: jobKey(event.id, visitDate),
				visitDate,
				start,
				end,
				summary: event.summary || "",
				description: event.description || "",
				location: event.location || "",
				clientName: priv.clientName || "",
				// Not from private metadata — this is a real Google Calendar
				// attendee (set via `attendeeEmail` in createBookingEvent(), see
				// stripe-webhook.js), so it's available retroactively on every
				// recurring job ever booked, not just ones created after some new
				// field was added. Added for the Jobber-parity "Action Required"
				// on-hold feature (AGENTS.md → "Jobs") — the modal's "Put on
				// hold" button uses this to find the client's Stripe subscription
				// by email, the same lookup /admin/reschedule already does.
				clientEmail: event.attendees?.[0]?.email || "",
				amountPaid: priv.amountPaid || "",
				jobType: priv.jobType || "",
				jobNumber: priv.jobNumber || "",
				// Only set for quote-based jobs (jobType "quote_based") —
				// quotedTotal/depositAmount are what staff entered at
				// job-creation time (create-quote-job.js), fixed once and never
				// updated after. What DOES change over time — depositStatus
				// ("pending" -> "paid") — deliberately isn't here: it lives in
				// the Firestore jobAssignments overlay instead (merged in
				// below), same "static facts on the calendar event, mutable
				// state in Firestore" split the rest of this file already uses.
				quotedTotal: priv.quotedTotal || "",
				depositAmount: priv.depositAmount || "",
			};
		});

		const assignments = await getJobAssignments(jobs.map((j) => j.jobKey));

		const merged = jobs
			.map((j) => ({ ...j, ...assignments.get(j.jobKey) }))
			.sort((a, b) => new Date(a.start) - new Date(b.start));

		return json({ jobs: merged });
	} catch (err) {
		return json({ error: "Couldn't load jobs: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
