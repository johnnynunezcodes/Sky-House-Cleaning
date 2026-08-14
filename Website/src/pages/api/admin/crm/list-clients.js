// Staff-only: lists CRM contacts, optionally filtered by lifecycle stage.
// Gated by the Basic Auth middleware (src/middleware.js) — never reachable
// without the admin credentials. See src/lib/crm.js for the data shape.
export const prerender = false;

import { listClients } from "../../../../lib/crm.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const lifecycleStage = url.searchParams.get("lifecycleStage") || undefined;

	try {
		const clients = await listClients({ lifecycleStage });
		return json({ clients });
	} catch (err) {
		return json({ error: "Couldn't load contacts: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
