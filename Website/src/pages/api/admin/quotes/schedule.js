// Staff-only: the moment an accepted quote becomes a real job. Staff pick an
// actual date/time here — this is the ONLY place in the new quotes flow
// that creates a calendar event (see AGENTS.md → "Requests & Quotes"; the
// old /api/admin/create-quote-job.js used to do this immediately on quote
// creation, this endpoint is what replaced that behavior, just moved to
// after acceptance).
export const prerender = false;

import { getQuote, markQuoteScheduled } from "../../../../lib/quotes.js";
import { createBookingEvent, isConfigured as isCalendarConfigured, isSlotStillFree, zonedTimeToUtc } from "../../../../lib/googleCalendar.js";
import { getNextJobNumber, jobKey, upsertJobAssignment } from "../../../../lib/dispatch.js";
import { isConfigured as isFirebaseConfigured } from "../../../../lib/firebaseAdmin.js";
import { QUOTE_SERVICE_TYPES } from "../../../../data/booking.js";

const TIME_ZONE = "America/Los_Angeles";

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

	const { id, date, time, estimatedHours } = body || {};
	if (!id) {
		return json({ error: "Missing quote id." }, 400);
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
		return json({ error: "Please pick a valid date." }, 400);
	}
	if (!/^\d{2}:\d{2}$/.test(time || "")) {
		return json({ error: "Please pick a valid start time." }, 400);
	}
	const hours = Number(estimatedHours);
	if (!hours || hours <= 0 || hours > 24) {
		return json({ error: "Please enter a realistic estimated duration, in hours." }, 400);
	}

	let quote;
	try {
		quote = await getQuote(id);
	} catch (err) {
		return json({ error: "Couldn't load that quote: " + err.message }, 500);
	}
	if (!quote) {
		return json({ error: "Quote not found." }, 404);
	}
	if (quote.status !== "accepted") {
		return json({ error: "This quote hasn't been accepted yet — nothing to schedule." }, 409);
	}

	const [hour, minute] = time.split(":").map(Number);
	const start = zonedTimeToUtc(date, hour, minute, TIME_ZONE);
	const end = new Date(start.getTime() + hours * 60 * 60 * 1000);

	let busyWarning = "";
	try {
		const stillFree = await isSlotStillFree({ start: start.toISOString(), end: end.toISOString() });
		if (!stillFree) {
			busyWarning = "Heads up: this time already shows something else on the calendar — double check for a conflict.";
		}
	} catch {
		// Non-blocking, same as every other slot-freshness check in this app.
	}

	const serviceLabel = QUOTE_SERVICE_TYPES[quote.serviceType] || quote.serviceType || "Job";
	const customer = quote.customer || {};
	const descriptionLines = [
		`Service: ${serviceLabel} (quote-based)`,
		`Quoted total: $${Number(quote.quotedTotal).toFixed(2)}`,
		`Deposit collected: $${Number(quote.depositAmount).toFixed(2)}`,
		customer.phone ? `Phone: ${customer.phone}` : null,
		customer.email ? `Email: ${customer.email}` : null,
		customer.address ? `Address: ${customer.address}` : null,
		quote.notes ? `Notes: ${quote.notes}` : null,
	].filter(Boolean);

	let jobNumber = "";
	try {
		jobNumber = String(await getNextJobNumber());
	} catch (err) {
		console.error("Failed to assign job number:", err?.message);
	}

	let createdEvent;
	try {
		createdEvent = await createBookingEvent({
			start: start.toISOString(),
			end: end.toISOString(),
			summary: `Sky House Cleaning: ${customer.name || "Customer"}, ${serviceLabel}`,
			description: descriptionLines.join("\n"),
			location: customer.address || undefined,
			attendeeEmail: customer.email || undefined,
			privateMetadata: {
				jobNumber,
				clientName: customer.name || "",
				jobType: "quote_based",
				serviceType: quote.serviceType,
				quotedTotal: Number(quote.quotedTotal).toFixed(2),
				depositAmount: Number(quote.depositAmount).toFixed(2),
			},
		});
	} catch (err) {
		return json({ error: "Couldn't create the calendar event: " + err.message }, 500);
	}

	const key = jobKey(createdEvent.id, date);

	try {
		await upsertJobAssignment(key, {
			eventId: createdEvent.id,
			visitDate: date,
			assignedCleanerIds: [],
			status: "unassigned",
			dispatchNotes: "",
			cleanerConfirmed: false,
			depositStatus: "paid",
		});
	} catch (err) {
		return json(
			{ error: "The job was created on the calendar, but saving its dispatch record failed: " + err.message },
			500,
		);
	}

	try {
		await markQuoteScheduled(id, { jobKey: key, eventId: createdEvent.id, visitDate: date });
	} catch (err) {
		return json(
			{ error: "The job was created and is on the calendar, but updating the quote record failed: " + err.message },
			500,
		);
	}

	return json({ jobNumber, warning: busyWarning || undefined });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
