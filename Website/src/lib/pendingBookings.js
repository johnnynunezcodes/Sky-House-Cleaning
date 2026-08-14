// Data access for phone-in bookings that are awaiting the CUSTOMER's own
// confirmation + policy acceptance before payment starts.
//
// Why this exists: /admin/book.astro is staff filling out a form on someone
// else's behalf over the phone. A checkbox on that screen would only prove
// the staff member clicked it, not that the customer actually agreed to
// anything — see the AGENTS.md "Phone booking confirmation link" section for
// the full reasoning (this mirrors how Jobber/Housecall Pro/ServiceTitan all
// handle remote quote approval: a secure link the customer themselves has to
// open and accept). So instead of staff generating a Stripe payment link
// directly, staff generate a pendingBooking here and send the customer a
// link to /confirm/[id] — only once THEY check the policy box there does
// /api/confirm/finalize-pending-booking.js actually create the Stripe
// Checkout session.
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin.js";

// How long a confirmation link stays valid. Deliberately generous (a week)
// since the whole point is giving a customer time to actually read it,
// rather than pressuring an immediate click — if a link does go stale,
// staff can just generate a fresh one from the same quote.
export const PENDING_BOOKING_EXPIRY_DAYS = 7;

const COLLECTION = "pendingBookings";

export async function createPendingBooking({ selections, customer, slot }) {
	const db = getDb();
	const expiresAt = new Date(Date.now() + PENDING_BOOKING_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const ref = await db.collection(COLLECTION).add({
		selections,
		customer,
		slot,
		// "pending" -> "converted" once the customer confirms and Stripe
		// Checkout is created. There's no "expired" write — expiry is just
		// checked against `expiresAt` at read time, so nothing needs to sweep
		// old docs; they're just inert history past that date.
		status: "pending",
		createdAt: FieldValue.serverTimestamp(),
		expiresAt,
	});
	return ref.id;
}

export async function getPendingBooking(id) {
	const db = getDb();
	const doc = await db.collection(COLLECTION).doc(id).get();
	if (!doc.exists) return null;
	return { id: doc.id, ...doc.data() };
}

export async function markPendingBookingConverted(id, { stripeSessionId } = {}) {
	const db = getDb();
	await db
		.collection(COLLECTION)
		.doc(id)
		.update({
			status: "converted",
			stripeSessionId: stripeSessionId || "",
			convertedAt: FieldValue.serverTimestamp(),
		});
}
