// Staff-only: marks a deal Won. Separate from update-deal.js on purpose —
// this has a real side effect (flips the linked client's lifecycleStage to
// "active_client" via markDealWon in src/lib/crm.js), so it gets its own
// unambiguous action rather than being one value in a stage dropdown.
export const prerender = false;

import { markDealWon } from "../../../../lib/crm.js";
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

	if (!body.id) {
		return json({ error: "Missing deal id." }, 400);
	}

	try {
		await markDealWon(body.id);
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't mark deal won: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
