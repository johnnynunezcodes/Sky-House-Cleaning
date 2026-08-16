// Staff-only: assigns cleaner(s) to a job occurrence and/or changes its
// status. Upserts the Firestore overlay doc — see src/lib/dispatch.js for
// why it's keyed by eventId+visitDate rather than eventId alone.
export const prerender = false;

import { upsertJobAssignment, getJobAssignments, JOB_STATUSES } from "../../../../lib/dispatch.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";
import { getBookingEvent, createReminderEvent, isConfigured as isCalendarConfigured } from "../../../../lib/googleCalendar.js";
import { QUOTE_SERVICE_TYPES } from "../../../../data/booking.js";
import { createInvoice } from "../../../../lib/invoices.js";
import { getPendingDepositByJobKey } from "../../../../lib/pendingDeposits.js";

export async function POST({ request }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { jobKey, eventId, visitDate } = body;
	if (!jobKey || !eventId || !visitDate) {
		return json({ error: "Missing jobKey/eventId/visitDate." }, 400);
	}

	const fields = {};
	if (Array.isArray(body.assignedCleanerIds)) {
		fields.assignedCleanerIds = body.assignedCleanerIds.filter((id) => typeof id === "string" && id);
	}
	if (body.status !== undefined) {
		if (!JOB_STATUSES.includes(body.status)) {
			return json({ error: `status must be one of: ${JOB_STATUSES.join(", ")}` }, 400);
		}
		fields.status = body.status;
	}
	if (typeof body.dispatchNotes === "string") {
		fields.dispatchNotes = body.dispatchNotes.trim();
	}
	if (typeof body.cleanerConfirmed === "boolean") {
		fields.cleanerConfirmed = body.cleanerConfirmed;
	}

	// Only relevant on the actual transition INTO "completed" — read the
	// current doc first so re-saving an already-completed job (or toggling
	// status back and forth) never fires this twice. Wrapped around the main
	// update rather than after it so `invoiceReminderSent` can ride along in
	// the same upsert instead of a second write.
	let reminderFields = {};
	if (fields.status === "completed") {
		try {
			const current = (await getJobAssignments([jobKey])).get(jobKey);
			const alreadyCompleted = current?.status === "completed";
			const depositWasPaid = current?.depositStatus === "paid";
			const alreadyReminded = current?.invoiceReminderSent === true;

			if (!alreadyCompleted && depositWasPaid && !alreadyReminded && isCalendarConfigured()) {
				const event = await getBookingEvent({ eventId });
				const priv = event.extendedProperties?.private || {};

				if (priv.jobType === "quote_based") {
					const quotedTotal = parseFloat(priv.quotedTotal) || 0;
					const depositAmount = parseFloat(priv.depositAmount) || 0;
					const remaining = Math.round((quotedTotal - depositAmount) * 100) / 100;

					if (remaining > 0) {
						const serviceLabel = QUOTE_SERVICE_TYPES[priv.serviceType] || "Quote-based job";
						try {
							await createReminderEvent({
								summary: `💰 Invoice balance due: ${priv.clientName || "customer"} — $${remaining.toFixed(2)}${priv.jobNumber ? ` (Job #${priv.jobNumber})` : ""}`,
								description: [
									`${priv.clientName || "This customer"}'s ${serviceLabel.toLowerCase()} job was just marked completed.`,
									`Quoted total: $${quotedTotal.toFixed(2)}`,
									`Deposit already collected: $${depositAmount.toFixed(2)}`,
									`Remaining balance still owed: $${remaining.toFixed(2)}`,
									event.location ? `Address: ${event.location}` : null,
									`See Job #${priv.jobNumber || "—"} on /admin/jobs for full contact details.`,
								]
									.filter(Boolean)
									.join("\n"),
							});
							reminderFields.invoiceReminderSent = true;
						} catch (err) {
							// Non-fatal, same tolerance stripe-webhook.js has for its own
							// minimum-commitment reminder — the status change itself
							// still saves below even if this notification fails.
							console.error("Failed to create invoice-balance reminder event:", err?.message);
						}

						// Alongside the calendar nudge above, create the actual invoice
						// record that shows up on /admin/invoices — as a "draft" so staff
						// can double-check/adjust the amount (e.g. actual hours ran over
						// the estimate) before sending the customer a pay link. Gated by
						// the same outer `!alreadyReminded` check as the reminder above,
						// so re-saving an already-completed job never creates a duplicate.
						try {
							const depositRecord = await getPendingDepositByJobKey(jobKey).catch(() => null);
							const customer = depositRecord?.customer || {};
							await createInvoice({
								jobKey,
								eventId,
								visitDate,
								jobNumber: priv.jobNumber || "",
								clientName: priv.clientName || customer.name || "",
								clientEmail: customer.email || "",
								clientPhone: customer.phone || "",
								serviceType: priv.serviceType || "",
								amount: remaining,
							});
						} catch (err) {
							// Non-fatal for the same reason as the reminder above — a
							// missing invoice record can always be created by hand from
							// /admin/invoices afterward.
							console.error("Failed to auto-create invoice:", err?.message);
						}
					}
				}
			}
		} catch (err) {
			console.error("Failed to check for an invoice-balance reminder:", err?.message);
		}
	}

	try {
		await upsertJobAssignment(jobKey, { eventId, visitDate, ...fields, ...reminderFields });
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update job: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
