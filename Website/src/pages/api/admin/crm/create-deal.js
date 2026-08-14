// Staff-only: creates a new deal, either against an existing contact
// (contactId) or a brand-new one (newContact — created as a "lead" first,
// same as if you'd added them on the Contacts page). Covers the common
// "someone just called in and isn't in the system yet" case in one step.
export const prerender = false;

import { createClient, createDeal } from "../../../../lib/crm.js";
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

	const title = (body.title || "").trim();
	if (!title) {
		return json({ error: "Title is required." }, 400);
	}

	let contactId = body.contactId || "";

	try {
		if (!contactId) {
			const newContact = body.newContact || {};
			const name = (newContact.name || "").trim();
			if (!name) {
				return json({ error: "Select an existing contact, or fill in a name for the new one." }, 400);
			}
			contactId = await createClient({
				name,
				phone: (newContact.phone || "").trim(),
				email: (newContact.email || "").trim(),
				leadSource: (newContact.leadSource || "").trim(),
				lifecycleStage: "lead",
			});
		}

		const id = await createDeal({
			contactId,
			title,
			serviceType: (body.serviceType || "").trim(),
			estimatedValue: body.estimatedValue ? Number(body.estimatedValue) : null,
			expectedCloseDate: body.expectedCloseDate || null,
			notes: (body.notes || "").trim(),
		});
		return json({ id, contactId });
	} catch (err) {
		return json({ error: "Couldn't create deal: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
