// Staff-only: edit an invoice's amount/notes/due date, or void it. Kept
// separate from send.js/mark-paid.js (rather than one do-everything
// endpoint) so each action's validation stays simple and obvious, matching
// how update-deal.js/win-deal.js are split apart in the CRM.
export const prerender = false;

import { getInvoice, updateInvoice, INVOICE_STATUSES } from "../../../../lib/invoices.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

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

	const { id } = body || {};
	if (!id) {
		return json({ error: "Missing invoice id." }, 400);
	}

	let invoice;
	try {
		invoice = await getInvoice(id);
	} catch (err) {
		return json({ error: "Couldn't load that invoice: " + err.message }, 500);
	}
	if (!invoice) {
		return json({ error: "Invoice not found." }, 404);
	}
	if (invoice.status === "paid") {
		return json({ error: "This invoice is already paid and can't be edited." }, 409);
	}

	const fields = {};
	if (body.amount !== undefined) {
		const amount = Number(body.amount);
		if (!amount || amount <= 0) {
			return json({ error: "Please enter a valid amount." }, 400);
		}
		fields.amount = Math.round(amount * 100) / 100;
	}
	if (typeof body.notes === "string") {
		fields.notes = body.notes.trim();
	}
	if (typeof body.dueAt === "string" && body.dueAt) {
		fields.dueAt = new Date(body.dueAt).toISOString();
	}
	if (body.status !== undefined) {
		if (!INVOICE_STATUSES.includes(body.status)) {
			return json({ error: `status must be one of: ${INVOICE_STATUSES.join(", ")}` }, 400);
		}
		fields.status = body.status;
	}

	if (Object.keys(fields).length === 0) {
		return json({ error: "Nothing to update." }, 400);
	}

	try {
		await updateInvoice(id, fields);
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update invoice: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
