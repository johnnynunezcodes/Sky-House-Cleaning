// Staff-only: lists formal quotes (src/lib/quotes.js), optionally filtered
// by status. Used by /admin/crm/quotes.astro alongside the deal-level
// quote_sent/follow_up pipeline — see AGENTS.md → "Requests & Quotes".
export const prerender = false;

import { listQuotes } from "../../../../lib/quotes.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const status = url.searchParams.get("status") || undefined;

	try {
		const quotes = await listQuotes({ status });
		return json({ quotes });
	} catch (err) {
		return json({ error: "Couldn't load quotes: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
