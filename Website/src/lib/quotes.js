// Data access for formal quotes on the three custom-priced services
// (Office & Commercial Cleaning, Garage Cleaning & Organization,
// Post-Construction Cleaning — see QUOTE_SERVICE_TYPES in data/booking.js).
// Supersedes the old pendingDeposits.js flow for this specific case — see
// AGENTS.md → "Requests & Quotes" for the full "why."
//
// The key difference from the old flow: NO calendar event exists yet when a
// quote is created. Staff send a price + deposit terms with no date/time
// attached; only once the customer accepts and pays the deposit does the
// quote become "accepted" (see markQuoteAccepted), and only once STAFF then
// pick a date/time (see markQuoteScheduled, called from
// /api/admin/quotes/schedule.js) does a real job/calendar event exist. This
// mirrors Jobber's own Request → Quote → Job separation, and avoids ever
// holding a calendar slot for a price nobody has agreed to yet.
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin.js";

export const QUOTE_STATUSES = ["pending", "accepted", "declined", "expired", "scheduled"];

// Same reasoning as PENDING_DEPOSIT_EXPIRY_DAYS used to have: give the
// customer real time to review rather than pressuring an immediate click.
export const QUOTE_EXPIRY_DAYS = 14;

const COLLECTION = "quotes";

function docToObject(doc) {
	return { id: doc.id, ...doc.data() };
}

export async function createQuote({ dealId, serviceType, customer, quotedTotal, depositType, depositValue, depositAmount, notes }) {
	const db = getDb();
	const expiresAt = new Date(Date.now() + QUOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const ref = await db.collection(COLLECTION).add({
		dealId: dealId || "",
		serviceType,
		customer,
		quotedTotal,
		depositType,
		depositValue,
		depositAmount,
		notes: notes || "",
		status: "pending",
		stripeSessionId: "",
		// Filled in by markQuoteScheduled() once staff pick a date/time for an
		// accepted quote — empty until then.
		jobKey: "",
		eventId: "",
		visitDate: "",
		createdAt: FieldValue.serverTimestamp(),
		expiresAt,
	});
	return ref.id;
}

export async function getQuote(id) {
	const db = getDb();
	const doc = await db.collection(COLLECTION).doc(id).get();
	if (!doc.exists) return null;
	return docToObject(doc);
}

export async function listQuotes({ status } = {}) {
	const db = getDb();
	let query = db.collection(COLLECTION).orderBy("createdAt", "desc");
	if (status) query = query.where("status", "==", status);
	const snapshot = await query.get();
	return snapshot.docs.map(docToObject);
}

// Customer confirmed the quote and paid the deposit — see
// /api/confirm-quote/finalize.js + the `metadata.quoteId` branch in
// stripe-webhook.js. Deliberately does NOT create a calendar event; that
// only happens once staff pick a date via markQuoteScheduled below.
export async function markQuoteAccepted(id, { stripeSessionId } = {}) {
	const db = getDb();
	await db
		.collection(COLLECTION)
		.doc(id)
		.update({
			status: "accepted",
			stripeSessionId: stripeSessionId || "",
			acceptedAt: FieldValue.serverTimestamp(),
		});
}

// Staff picked a date/time on the Quotes page and the real job/calendar
// event now exists — see /api/admin/quotes/schedule.js.
export async function markQuoteScheduled(id, { jobKey, eventId, visitDate }) {
	const db = getDb();
	await db.collection(COLLECTION).doc(id).update({
		status: "scheduled",
		jobKey,
		eventId,
		visitDate,
		scheduledAt: FieldValue.serverTimestamp(),
	});
}

export async function markQuoteDeclined(id) {
	const db = getDb();
	await db.collection(COLLECTION).doc(id).update({ status: "declined" });
}

// Used by update-job.js when a scheduled quote's job is later marked
// completed: the calendar event's own extendedProperties.private only
// carries clientName (see /api/admin/quotes/schedule.js), not
// phone/email, but the quote doc already has the full `customer` object —
// same reasoning getPendingDepositByJobKey() used to have in
// pendingDeposits.js. There's always at most one quote per jobKey.
export async function getQuoteByJobKey(jobKey) {
	const db = getDb();
	const snapshot = await db.collection(COLLECTION).where("jobKey", "==", jobKey).limit(1).get();
	if (snapshot.empty) return null;
	return docToObject(snapshot.docs[0]);
}
