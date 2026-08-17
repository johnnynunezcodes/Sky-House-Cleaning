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

// `cleanerConfirmed` is a manual staff toggle for now — checked by hand
// after calling/texting the cleaner to confirm they've got the job — since
// cleaners don't have their own login yet (see AGENTS.md → "Dispatcher
// (jobs)" and task list item "Dispatcher: per-cleaner login + mobile crew
// view"). It's deliberately named after the END STATE ("the cleaner has
// confirmed"), not the mechanism ("staff checked a box"), so that once
// per-cleaner login exists, a cleaner tapping "Accept" in their own mobile
// view can just set this same field directly — nothing about this field or
// its callers needs to change, only who's allowed to flip it.
// `archived` — added for the Jobber-parity Jobs redesign (see AGENTS.md →
// "Jobs (formerly Dispatcher)"). Purely a visibility flag ("done with this,
// stop showing it by default") — doesn't touch billing or the calendar
// event itself, unlike the separate on-hold/Action-Required concept below,
// which pauses a whole recurring plan rather than hiding a single visit.
const DEFAULT_ASSIGNMENT = {
	assignedCleanerIds: [],
	status: "unassigned",
	dispatchNotes: "",
	cleanerConfirmed: false,
	archived: false,
};

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

// ---- Job numbers ----------------------------------------------------------

const COUNTERS_COLLECTION = "counters";
const JOB_NUMBER_COUNTER_ID = "jobNumber";

// Firestore has no native auto-increment column — this is the standard
// workaround: a single counter doc, read-and-incremented inside a
// transaction so two jobs created at the same instant (e.g. two webhook
// events firing close together) can never end up with the same number.
// Staff-facing job numbers start at 1, not 0.
//
// Only ever called at job-creation time — see the createBookingEvent() call
// sites in stripe-webhook.js and create-quote-job.js. There's no retroactive
// backfill: jobs that predate this feature simply have no number, same as
// the amountPaid/jobType/clientName private-metadata fields added alongside
// it (see googleCalendar.js's extendedProperties.private comment).
export async function getNextJobNumber() {
	const db = getDb();
	const ref = db.collection(COUNTERS_COLLECTION).doc(JOB_NUMBER_COUNTER_ID);
	return db.runTransaction(async (tx) => {
		const doc = await tx.get(ref);
		const next = (doc.exists ? doc.data().value || 0 : 0) + 1;
		tx.set(ref, { value: next }, { merge: true });
		return next;
	});
}
