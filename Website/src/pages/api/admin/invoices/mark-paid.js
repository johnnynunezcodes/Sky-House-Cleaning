// Staff-only: manually mark an invoice paid — for when the customer pays by
// check, cash, or a card run over the phone rather than through the public
// /pay/[id] link. Kept separate from update.js since this is a distinct,
// one-way action (like win-deal.js vs. update-deal.js in the CRM) rather
// than a generic field edit.
export const prerender = false;

import { getInvoice, markInvoicePaid } from "../../../../lib/invoices.js";
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
		return json({ error: "This invoice is already marked paid." }, 409);
	}

	try {
		await markInvoicePaid(id, { paymentMethod: "manual" });
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update invoice: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
