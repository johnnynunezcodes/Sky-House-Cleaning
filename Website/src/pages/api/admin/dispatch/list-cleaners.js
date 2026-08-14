// Staff-only: lists cleaners, for the dispatch board's assignment picker.
export const prerender = false;

import { listCleaners } from "../../../../lib/dispatch.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const activeOnly = url.searchParams.get("activeOnly") === "true";

	try {
		const cleaners = await listCleaners({ activeOnly });
		return json({ cleaners });
	} catch (err) {
		return json({ error: "Couldn't load cleaners: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
