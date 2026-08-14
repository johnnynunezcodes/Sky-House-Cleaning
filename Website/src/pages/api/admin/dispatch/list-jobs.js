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
	const days = Math.max(1, Math.min(31, parseInt(url.searchParams.get("days") || "1", 10) || 1));

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
			return {
				eventId: event.id,
				jobKey: jobKey(event.id, visitDate),
				visitDate,
				start,
				end,
				summary: event.summary || "",
				description: event.description || "",
				location: event.location || "",
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
