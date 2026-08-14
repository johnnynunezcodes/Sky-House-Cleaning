// Data access for the dispatcher. Deliberately does NOT duplicate booking
// details (client, address, time) into Firestore — Google Calendar already
// is that source of truth (see googleCalendar.js's listEvents). This file
// only adds the dispatch-specific overlay: which cleaner(s) are assigned
// and what status the job is in, keyed to a specific calendar event.
//
// Why the job key is `${eventId}::${visitDate}` and not just the eventId:
// recurring plans reuse the same calendar event, moving it forward to the
// next date each billing cycle (see updateBookingEvent in googleCalendar.js)
// rather than creating a fresh event every time. If assignment/status were
// keyed by eventId alone, marking last week's visit "completed" would still
// show as completed on this week's not-yet-done visit once the event moves.
// Folding the visit's start date into the key means each occurrence gets
// its own fresh "unassigned" state automatically, and old keys are left
// behind as a free history of completed jobs.
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin.js";

export const JOB_STATUSES = ["unassigned", "assigned", "en_route", "in_progress", "completed"];

const CLEANERS_COLLECTION = "cleaners";
const JOB_ASSIGNMENTS_COLLECTION = "jobAssignments";

function docToObject(doc) {
	return { id: doc.id, ...doc.data() };
}

// `eventId` is whatever Google Calendar's API returned for the event.
// `visitDate` should be "YYYY-MM-DD" in the business's local time zone —
// callers get this from the event's start time, not by parsing the key
// back apart, since Firestore doc IDs have character restrictions that
// make round-tripping fragile.
export function jobKey(eventId, visitDate) {
	return `${eventId}::${visitDate}`;
}

// ---- Cleaners -----------------------------------------------------------

export async function listCleaners({ activeOnly = false } = {}) {
	const db = getDb();
	let query = db.collection(CLEANERS_COLLECTION).orderBy("name");
	if (activeOnly) query = query.where("active", "==", true);
	const snapshot = await query.get();
	return snapshot.docs.map(docToObject);
}

export async function createCleaner(fields) {
	const db = getDb();
	const now = FieldValue.serverTimestamp();
	const ref = await db.collection(CLEANERS_COLLECTION).add({
		name: "",
		phone: "",
		email: "",
		active: true,
		firebaseAuthUid: "",
		...fields,
		createdAt: now,
		updatedAt: now,
	});
	return ref.id;
}

export async function updateCleaner(cleanerId, fields) {
	const db = getDb();
	await db
		.collection(CLEANERS_COLLECTION)
		.doc(cleanerId)
		.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

// ---- Job assignments (the dispatch overlay) ------------------------------

const DEFAULT_ASSIGNMENT = { assignedCleanerIds: [], status: "unassigned", dispatchNotes: "" };

// Batch-fetches assignment docs for a set of job keys in one round trip
// (Firestore's `getAll` rather than N individual reads), returning a Map
// keyed by job key. Keys with no doc yet come back with sensible defaults
// rather than being left out, so callers don't need a second existence
// check before reading `.status`.
export async function getJobAssignments(keys) {
	const db = getDb();
	const result = new Map();
	if (keys.length === 0) return result;

	const refs = keys.map((key) => db.collection(JOB_ASSIGNMENTS_COLLECTION).doc(key));
	const docs = await db.getAll(...refs);

	docs.forEach((doc, i) => {
		result.set(keys[i], doc.exists ? { id: doc.id, ...doc.data() } : { id: keys[i], ...DEFAULT_ASSIGNMENT });
	});
	return result;
}

// Creates or updates the assignment doc for one job occurrence. `eventId`
// and `visitDate` are stored on the doc itself (not just encoded in the
// key) so they're easy to query/read without parsing the key apart.
export async function upsertJobAssignment(key, { eventId, visitDate, ...fields }) {
	const db = getDb();
	await db
		.collection(JOB_ASSIGNMENTS_COLLECTION)
		.doc(key)
		.set(
			{
				eventId,
				visitDate,
				...fields,
				updatedAt: FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);
}
