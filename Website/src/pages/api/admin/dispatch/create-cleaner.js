// Staff-only: adds a cleaner to the roster. firebaseAuthUid stays empty
// until that cleaner actually has a login (see the per-cleaner auth phase,
// not built yet) — a cleaner can exist here and be assignable on the
// dispatch board well before they can log into their own mobile view.
export const prerender = false;

import { createCleaner } from "../../../../lib/dispatch.js";
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

	try {
		const id = await createCleaner({
			name,
			phone: (body.phone || "").trim(),
			email: (body.email || "").trim(),
			active: body.active !== false,
		});
		return json({ id });
	} catch (err) {
		return json({ error: "Couldn't add cleaner: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
