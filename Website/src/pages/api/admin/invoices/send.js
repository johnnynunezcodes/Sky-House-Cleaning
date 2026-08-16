// Staff-only: flips an invoice from "draft" to "sent" and hands back the
// public pay link (/pay/[id]) for staff to text/email to the customer —
// same "staff generates a link, customer takes it from there" pattern as
// create-quote-job.js's confirmUrl. Doesn't send anything itself (no
// email/SMS provider is wired into this app — see AGENTS.md → Privacy
// Policy notes); copying/sending the link by hand is a deliberate choice,
// not a gap, matching how deposit links work today.
export const prerender = false;

import { getInvoice, markInvoiceSent } from "../../../../lib/invoices.js";
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
		return json({ error: "This invoice is already paid." }, 409);
	}
	if (invoice.status === "void") {
		return json({ error: "This invoice was voided." }, 409);
	}

	try {
		await markInvoiceSent(id);
	} catch (err) {
		return json({ error: "Couldn't update invoice status: " + err.message }, 500);
	}

	const origin = new URL(request.url).origin;
	return json({ payUrl: `${origin}/pay/${id}` });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
