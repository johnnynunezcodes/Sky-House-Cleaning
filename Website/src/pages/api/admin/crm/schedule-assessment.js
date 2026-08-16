// Staff-only: books a real site-visit on the calendar for a Request, with a
// cleaner assigned — this is the "make sure I have a cleaner available"
// step, modeled directly on how Jobber's own Requests handle an on-site
// assessment (see AGENTS.md → "Requests & Quotes"): booking a specific
// team member's time both checks AND reserves availability in one action,
// rather than trying to compute an abstract capacity number.
//
// Unlike a real job, an assessment has no price and creates no invoice — it
// shows up on /admin/jobs (jobType: "assessment") purely so staff/cleaners
// can see it on the schedule.
export const prerender = false;

import { getDeal, getClient, updateDeal } from "../../../../lib/crm.js";
import { createBookingEvent, zonedTimeToUtc, isConfigured as isCalendarConfigured } from "../../../../lib/googleCalendar.js";
import { jobKey, upsertJobAssignment } from "../../../../lib/dispatch.js";
import { isConfigured as isFirebaseConfigured } from "../../../../lib/firebaseAdmin.js";

const TIME_ZONE = "America/Los_Angeles";
const DEFAULT_DURATION_MINUTES = 60;

export async function POST({ request }) {
	if (!isFirebaseConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}
	if (!isCalendarConfigured()) {
		return json({ error: "Google Calendar isn't configured yet. See AGENTS.md." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { dealId, date, time, cleanerIds } = body || {};
	if (!dealId) {
		return json({ error: "Missing dealId." }, 400);
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
		return json({ error: "Please pick a valid date." }, 400);
	}
	if (!/^\d{2}:\d{2}$/.test(time || "")) {
		return json({ error: "Please pick a valid start time." }, 400);
	}

	let deal;
	try {
		deal = await getDeal(dealId);
	} catch (err) {
		return json({ error: "Couldn't load that request: " + err.message }, 500);
	}
	if (!deal) {
		return json({ error: "Request not found." }, 404);
	}

	const client = deal.contactId ? await getClient(deal.contactId).catch(() => null) : null;
	const clientName = client?.name || deal.title || "Customer";

	const [hour, minute] = time.split(":").map(Number);
	const start = zonedTimeToUtc(date, hour, minute, TIME_ZONE);
	const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

	let createdEvent;
	try {
		createdEvent = await createBookingEvent({
			start: start.toISOString(),
			end: end.toISOString(),
			summary: `Assessment: ${clientName}${deal.serviceType ? `, ${deal.serviceType}` : ""}`,
			description: [
				`Site visit to assess and price this request before sending a quote.`,
				deal.title ? `Request: ${deal.title}` : null,
				client?.phone ? `Phone: ${client.phone}` : null,
				client?.email ? `Email: ${client.email}` : null,
				client?.address ? `Address: ${client.address}` : null,
				deal.notes ? `Notes: ${deal.notes}` : null,
			]
				.filter(Boolean)
				.join("\n"),
			location: client?.address || undefined,
			attendeeEmail: client?.email || undefined,
			privateMetadata: {
				jobType: "assessment",
				clientName,
			},
		});
	} catch (err) {
		return json({ error: "Couldn't create the calendar event: " + err.message }, 500);
	}

	const key = jobKey(createdEvent.id, date);
	const assignedCleanerIds = Array.isArray(cleanerIds) ? cleanerIds.filter((id) => typeof id === "string" && id) : [];

	try {
		await upsertJobAssignment(key, {
			eventId: createdEvent.id,
			visitDate: date,
			assignedCleanerIds,
			status: assignedCleanerIds.length ? "assigned" : "unassigned",
			dispatchNotes: "",
			cleanerConfirmed: false,
		});
	} catch (err) {
		return json(
			{ error: "The assessment is on the calendar, but saving its dispatch record failed: " + err.message },
			500,
		);
	}

	try {
		await updateDeal(dealId, {
			assessment: {
				scheduled: true,
				completed: false,
				eventId: createdEvent.id,
				visitDate: date,
				cleanerIds: assignedCleanerIds,
			},
		});
	} catch (err) {
		return json(
			{ error: "The assessment is on the calendar, but updating the request failed: " + err.message },
			500,
		);
	}

	return json({ ok: true });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
