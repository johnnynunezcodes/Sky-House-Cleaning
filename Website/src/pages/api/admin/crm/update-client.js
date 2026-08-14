// Staff-only: updates an existing CRM contact. Takes the id in the body
// (same shape as reschedule-subscription.js etc.) rather than a URL param.
export const prerender = false;

import { updateClient, LIFECYCLE_STAGES } from "../../../../lib/crm.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

const EDITABLE_FIELDS = [
	"name",
	"phone",
	"email",
	"address",
	"accessNotes",
	"petNotes",
	"leadSource",
	"stripeCustomerId",
];

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

	const id = body.id;
	if (!id) {
		return json({ error: "Missing contact id." }, 400);
	}

	const fields = {};
	for (const key of EDITABLE_FIELDS) {
		if (typeof body[key] === "string") fields[key] = body[key].trim();
	}
	if (body.lifecycleStage) {
		if (!LIFECYCLE_STAGES.includes(body.lifecycleStage)) {
			return json({ error: `lifecycleStage must be one of: ${LIFECYCLE_STAGES.join(", ")}` }, 400);
		}
		fields.lifecycleStage = body.lifecycleStage;
	}

	try {
		await updateClient(id, fields);
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update contact: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
