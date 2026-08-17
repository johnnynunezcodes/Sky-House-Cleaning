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
import { getJobAssignments, isoDateInTimeZone, jobFromCalendarEvent } from "../../../../lib/dispatch.js";
import { isConfigured as firebaseConfigured } from "../../../../lib/firebaseAdmin.js";

const TIME_ZONE = "America/Los_Angeles";

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

		// Per-event -> job-shape transform lives in dispatch.js now
		// (jobFromCalendarEvent) — shared with get-job.js's single-event read
		// for the /admin/jobs/[jobKey] detail page, so the two never drift.
		const jobs = events.map(jobFromCalendarEvent);

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
