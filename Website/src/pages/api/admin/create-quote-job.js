// Staff-only: creates a quote-based job (commercial/office cleaning, garage
// cleaning & organization, post-construction cleaning — services with no
// catalog price, see src/data/booking.js's QUOTE_SERVICE_TYPES comment)
// directly from /admin/book-quote. Unlike every other booking path in this
// app, the calendar event is created immediately here, not after payment —
// there's no fixed price to protect the way calculatePrice() protects the
// catalog services, since staff (not the customer) are the ones typing in
// the quoted amount, in an authenticated admin tool the customer never
// touches. What IS still gated behind the customer's own action is the
// deposit: this only creates a pendingDeposit + confirm link
// (/confirm-deposit/[id]), it never charges anyone directly. See
// src/lib/pendingDeposits.js for why.
export const prerender = false;

import { QUOTE_SERVICE_TYPES } from "../../../data/booking.js";
import { createBookingEvent, isConfigured as isCalendarConfigured, isSlotStillFree, zonedTimeToUtc } from "../../../lib/googleCalendar.js";
import { getNextJobNumber, jobKey, upsertJobAssignment } from "../../../lib/dispatch.js";
import { createPendingDeposit } from "../../../lib/pendingDeposits.js";
import { isConfigured as isFirebaseConfigured } from "../../../lib/firebaseAdmin.js";

const REQUIRED_CUSTOMER_FIELDS = ["name", "phone", "address"];
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

	const { serviceType, customer, date, time, estimatedHours, quotedTotal, depositType, depositValue, notes } = body || {};

	if (!QUOTE_SERVICE_TYPES[serviceType]) {
		return json({ error: "Please choose a service type." }, 400);
	}
	const missingField = REQUIRED_CUSTOMER_FIELDS.find((field) => !customer?.[field]);
	if (missingField) {
		return json({ error: "Please fill in the customer's name, phone, and address." }, 400);
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
	const total = Number(quotedTotal);
	if (!total || total <= 0) {
		return json({ error: "Please enter the quoted total." }, 400);
	}
	if (depositType !== "percentage" && depositType !== "fixed") {
		return json({ error: "Please choose how the deposit is calculated." }, 400);
	}
	const rawDepositValue = Number(depositValue);
	if (!rawDepositValue || rawDepositValue <= 0) {
		return json({ error: "Please enter a deposit amount." }, 400);
	}
	if (depositType === "percentage" && rawDepositValue > 100) {
		return json({ error: "Deposit percentage can't be more than 100." }, 400);
	}

	// Deposit is always derived server-side from the quoted total staff just
	// entered — never trusted as a pre-computed dollar figure from the
	// client, same principle create-checkout-session.js follows for catalog
	// pricing (just applied to a manually-entered total instead of a
	// catalog lookup).
	const depositAmount =
		depositType === "percentage"
			? Math.round(total * (rawDepositValue / 100) * 100) / 100
			: Math.min(Math.round(rawDepositValue * 100) / 100, total);

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
		// Non-blocking — staff can see the calendar themselves, this is just a
		// convenience heads-up, not a hard gate like the catalog booking flow.
	}

	const serviceLabel = QUOTE_SERVICE_TYPES[serviceType];
	const descriptionLines = [
		`Service: ${serviceLabel} (quote-based)`,
		`Quoted total: $${total.toFixed(2)}`,
		`Deposit due: $${depositAmount.toFixed(2)}${depositType === "percentage" ? ` (${rawDepositValue}%)` : ""}`,
		customer.phone ? `Phone: ${customer.phone}` : null,
		customer.email ? `Email: ${customer.email}` : null,
		customer.address ? `Address: ${customer.address}` : null,
		notes ? `Notes: ${notes}` : null,
	].filter(Boolean);

	let jobNumber = "";
	try {
		jobNumber = String(await getNextJobNumber());
	} catch (err) {
		// Non-fatal — same graceful degradation as stripe-webhook.js's
		// nextJobNumberOrBlank(). The job still gets created either way.
		console.error("Failed to assign job number:", err?.message);
	}

	let createdEvent;
	try {
		createdEvent = await createBookingEvent({
			start: start.toISOString(),
			end: end.toISOString(),
			summary: `Sky House Cleaning: ${customer.name}, ${serviceLabel}`,
			description: descriptionLines.join("\n"),
			location: customer.address || undefined,
			attendeeEmail: customer.email || undefined,
			privateMetadata: {
				jobNumber,
				clientName: customer.name,
				jobType: "quote_based",
				// Distinct from jobType — jobType is the List view's Job Type
				// filter bucket ("quote_based" vs "one_time"/"recurring"),
				// serviceType is which of the three actual services this is
				// (a QUOTE_SERVICE_TYPES key). update-job.js's invoicing
				// reminder needs this to write a readable service name.
				serviceType,
				quotedTotal: total.toFixed(2),
				depositAmount: depositAmount.toFixed(2),
			},
		});
	} catch (err) {
		return json({ error: "Couldn't create the calendar event: " + err.message }, 500);
	}

	const key = jobKey(createdEvent.id, date);

	try {
		// Explicitly writing every field DEFAULT_ASSIGNMENT would otherwise
		// supply — getJobAssignments() only fills in defaults for a doc that
		// doesn't exist at all, not a partial one, so this doc has to be
		// created complete right away rather than relying on read-time
		// defaulting (see the comment on DEFAULT_ASSIGNMENT in dispatch.js).
		await upsertJobAssignment(key, {
			eventId: createdEvent.id,
			visitDate: date,
			assignedCleanerIds: [],
			status: "unassigned",
			dispatchNotes: "",
			cleanerConfirmed: false,
			// Distinct from cleanerConfirmed — this tracks whether the
			// CUSTOMER's deposit has cleared, not whether a cleaner has
			// accepted the job. Flipped to "paid" by stripe-webhook.js once
			// the deposit Checkout session actually completes.
			depositStatus: "pending",
		});
	} catch (err) {
		return json({ error: "Job was created on the calendar, but saving its dispatch record failed: " + err.message }, 500);
	}

	let confirmUrl = "";
	try {
		const id = await createPendingDeposit({
			jobKey: key,
			eventId: createdEvent.id,
			visitDate: date,
			start: start.toISOString(),
			end: end.toISOString(),
			serviceType,
			customer,
			quotedTotal: total,
			depositAmount,
		});
		const origin = new URL(request.url).origin;
		confirmUrl = `${origin}/confirm-deposit/${id}`;
	} catch (err) {
		return json(
			{
				error:
					"The job was created and is on the calendar, but generating the deposit link failed — you can try again from the job's details, or invoice the deposit by hand: " +
					err.message,
			},
			500,
		);
	}

	return json({ jobNumber, confirmUrl, warning: busyWarning || undefined });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
