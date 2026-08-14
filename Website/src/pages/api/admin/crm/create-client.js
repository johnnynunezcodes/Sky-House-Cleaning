// Staff-only: creates a new CRM contact. A lead created from a phone call
// might only have a name and phone number; a client added after an online
// booking might have the full set of fields. Anything not sent just isn't
// set — see createClient()'s defaults in src/lib/crm.js.
export const prerender = false;

import { createClient, LIFECYCLE_STAGES } from "../../../../lib/crm.js";
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

	const name = (body.name || "").trim();
	if (!name) {
		return json({ error: "Name is required." }, 400);
	}

	const lifecycleStage = LIFECYCLE_STAGES.includes(body.lifecycleStage) ? body.lifecycleStage : "lead";

	try {
		const id = await createClient({
			name,
			phone: (body.phone || "").trim(),
			email: (body.email || "").trim(),
			address: (body.address || "").trim(),
			accessNotes: (body.accessNotes || "").trim(),
			petNotes: (body.petNotes || "").trim(),
			leadSource: (body.leadSource || "").trim(),
			lifecycleStage,
		});
		return json({ id });
	} catch (err) {
		return json({ error: "Couldn't create contact: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
