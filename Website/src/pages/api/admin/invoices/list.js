// Staff-only: powers /admin/invoices. Optional ?status= filter matches
// listDeals()'s pattern in crm.js — omit it to get everything.
export const prerender = false;

import { listInvoices } from "../../../../lib/invoices.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const status = url.searchParams.get("status") || undefined;

	try {
		const invoices = await listInvoices({ status });
		return json({ invoices });
	} catch (err) {
		return json({ error: "Couldn't load invoices: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
