// Staff-only: fetches a single contact by id. Powers the "Convert to
// Booking" flow — /admin/book uses this to prefill name/email/phone from
// the CRM contact record when it's opened with a `?contactId=` param.
export const prerender = false;

import { getClient } from "../../../../lib/crm.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	const id = url.searchParams.get("id");
	if (!id) {
		return json({ error: "Missing id." }, 400);
	}

	try {
		const client = await getClient(id);
		if (!client) return json({ error: "Contact not found." }, 404);
		return json({ client });
	} catch (err) {
		return json({ error: "Couldn't load contact: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
