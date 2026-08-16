// Data access for deposits on quote-based jobs (commercial/office cleaning,
// garage cleaning & organization, post-construction cleaning — see
// AGENTS.md → "Jobs (formerly Dispatcher)" → "Quote-based jobs"). These
// services have no fixed catalog price (calculatePrice() in pricing.js has
// no branch for them at all), so unlike every other booking path in this
// app, the job itself is created immediately by staff in /admin/book-quote
// rather than waiting for payment — what's still gated behind the
// customer's own confirmation is the DEPOSIT, using the same reasoning as
// pendingBookings.js: a checkbox staff clicks on someone else's behalf
// proves nothing about what the customer agreed to. Staff generate a
// pendingDeposit here and send the customer a link to /confirm-deposit/[id]
// — only once they open it and confirm does
// /api/confirm-deposit/finalize.js create the Stripe Checkout session for
// the deposit amount.
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin.js";

// Same reasoning as PENDING_BOOKING_EXPIRY_DAYS in pendingBookings.js — give
// the customer real time to review a quote rather than pressuring an
// immediate click. The job itself is already on the calendar regardless of
// whether/when this link gets used, so a stale deposit link doesn't risk
// losing the appointment — staff can always send a fresh one.
export const PENDING_DEPOSIT_EXPIRY_DAYS = 14;

const COLLECTION = "pendingDeposits";

export async function createPendingDeposit({
	jobKey,
	eventId,
	visitDate,
	start,
	end,
	serviceType,
	customer,
	quotedTotal,
	depositAmount,
}) {
	const db = getDb();
	const expiresAt = new Date(Date.now() + PENDING_DEPOSIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const ref = await db.collection(COLLECTION).add({
		jobKey,
		eventId,
		visitDate,
		start: start || "",
		end: end || "",
		serviceType,
		customer,
		quotedTotal,
		depositAmount,
		// "pending" -> "paid" once the customer confirms and the deposit
		// Checkout session actually completes (see stripe-webhook.js) — same
		// "don't mark it done until the webhook says so" pattern
		// pendingBookings.js uses, for the same reason (a Checkout Session
		// existing isn't the same thing as it being paid).
		status: "pending",
		createdAt: FieldValue.serverTimestamp(),
		expiresAt,
	});
	return ref.id;
}

export async function getPendingDeposit(id) {
	const db = getDb();
	const doc = await db.collection(COLLECTION).doc(id).get();
	if (!doc.exists) return null;
	return { id: doc.id, ...doc.data() };
}

// Used by update-job.js when a quote-based job is marked completed: the
// calendar event's own extendedProperties.private only carries clientName
// (see create-quote-job.js), not phone/email/address, but the pendingDeposit
// doc created alongside it already has the full `customer` object — cheaper
// to look that back up by jobKey than to add more fields to the calendar
// event's private metadata just for this one read. There's always at most
// one pendingDeposit per jobKey (one deposit per quote-based job), so the
// first match is the only match.
export async function getPendingDepositByJobKey(jobKey) {
	const db = getDb();
	const snapshot = await db.collection(COLLECTION).where("jobKey", "==", jobKey).limit(1).get();
	if (snapshot.empty) return null;
	const doc = snapshot.docs[0];
	return { id: doc.id, ...doc.data() };
}

export async function markPendingDepositPaid(id, { stripeSessionId } = {}) {
	const db = getDb();
	await db
		.collection(COLLECTION)
		.doc(id)
		.update({
			status: "paid",
			stripeSessionId: stripeSessionId || "",
			paidAt: FieldValue.serverTimestamp(),
		});
}
