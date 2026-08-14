// Staff-only: edits a cleaner's details, including toggling `active` (an
// inactive cleaner stops showing up as an assignment option on the
// dispatch board, without deleting their history of past assignments).
export const prerender = false;

import { updateCleaner } from "../../../../lib/dispatch.js";
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

	const id = body.id;
	if (!id) {
		return json({ error: "Missing cleaner id." }, 400);
	}

	const fields = {};
	for (const key of ["name", "phone", "email"]) {
		if (typeof body[key] === "string") fields[key] = body[key].trim();
	}
	if (typeof body.active === "boolean") fields.active = body.active;

	try {
		await updateCleaner(id, fields);
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update cleaner: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
