// Staff-only: edits a deal's details, and handles the "lost" stage
// transition (with a reason). "Won" is deliberately NOT handled here — it
// has a side effect (activating the linked client) that deserves its own
// clear action rather than being one option in a general-purpose stage
// dropdown. See win-deal.js.
export const prerender = false;

import { updateDeal, markDealLost } from "../../../../lib/crm.js";
import { isConfigured } from "../../../../lib/firebaseAdmin.js";

const OPEN_STAGES = ["new_inquiry", "quote_sent", "follow_up"];

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
		return json({ error: "Missing deal id." }, 400);
	}

	if (body.stage === "won") {
		return json({ error: 'Use the "Mark Won" button to close a deal — it also activates the linked client.' }, 400);
	}

	const fields = {};
	for (const key of ["title", "serviceType", "notes"]) {
		if (typeof body[key] === "string") fields[key] = body[key].trim();
	}
	if (body.estimatedValue !== undefined) {
		fields.estimatedValue = body.estimatedValue === "" || body.estimatedValue == null ? null : Number(body.estimatedValue);
	}
	if (body.expectedCloseDate !== undefined) {
		fields.expectedCloseDate = body.expectedCloseDate || null;
	}

	try {
		if (body.stage === "lost") {
			await markDealLost(id, (body.lostReason || "").trim());
			if (Object.keys(fields).length) await updateDeal(id, fields);
		} else {
			if (body.stage) {
				if (!OPEN_STAGES.includes(body.stage)) {
					return json({ error: `stage must be one of: ${OPEN_STAGES.join(", ")}, or "lost"` }, 400);
				}
				fields.stage = body.stage;
			}
			await updateDeal(id, fields);
		}
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update deal: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
