// Staff-only: assigns cleaner(s) to a job occurrence and/or changes its
// status. Upserts the Firestore overlay doc — see src/lib/dispatch.js for
// why it's keyed by eventId+visitDate rather than eventId alone.
export const prerender = false;

import { upsertJobAssignment, JOB_STATUSES } from "../../../../lib/dispatch.js";
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

	const { jobKey, eventId, visitDate } = body;
	if (!jobKey || !eventId || !visitDate) {
		return json({ error: "Missing jobKey/eventId/visitDate." }, 400);
	}

	const fields = {};
	if (Array.isArray(body.assignedCleanerIds)) {
		fields.assignedCleanerIds = body.assignedCleanerIds.filter((id) => typeof id === "string" && id);
	}
	if (body.status !== undefined) {
		if (!JOB_STATUSES.includes(body.status)) {
			return json({ error: `status must be one of: ${JOB_STATUSES.join(", ")}` }, 400);
		}
		fields.status = body.status;
	}
	if (typeof body.dispatchNotes === "string") {
		fields.dispatchNotes = body.dispatchNotes.trim();
	}
	if (typeof body.cleanerConfirmed === "boolean") {
		fields.cleanerConfirmed = body.cleanerConfirmed;
	}

	try {
		await upsertJobAssignment(jobKey, { eventId, visitDate, ...fields });
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update job: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
