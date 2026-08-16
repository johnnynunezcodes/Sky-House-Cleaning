// Staff-only: lists deals (the lead pipeline), optionally filtered by
// stage. Joins in the linked contact's name/phone/email so the UI doesn't
// need a second round trip per card.
export const prerender = false;

import { listDeals, listClients } from "../../../../lib/crm.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const stage = url.searchParams.get("stage") || undefined;

	try {
		const [deals, clients] = await Promise.all([listDeals({ stage }), listClients()]);
		const clientMap = new Map(clients.map((c) => [c.id, c]));

		const enriched = deals.map((deal) => {
			const contact = clientMap.get(deal.contactId);
			return {
				...deal,
				contactName: contact?.name || "(contact not found)",
				contactPhone: contact?.phone || "",
				contactEmail: contact?.email || "",
				// Added for /admin/book-quote.astro's ?dealId= prefill (a Request's
				// "Send a Quote" action) — every other consumer of this endpoint
				// just ignores the extra field.
				contactAddress: contact?.address || "",
			};
		});

		return json({ deals: enriched });
	} catch (err) {
		return json({ error: "Couldn't load deals: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
