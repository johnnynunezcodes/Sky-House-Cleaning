// Data access for invoices — tracking the remaining balance owed on
// quote-based jobs (commercial/office cleaning, garage cleaning &
// organization, post-construction cleaning) after their deposit is paid and
// the work is done. See AGENTS.md → "Invoices" for the full picture.
//
// Distinct from pendingDeposits.js/pendingBookings.js in one important way:
// those are short-lived, single-purpose "pending" records that get replaced
// by a real Stripe object once confirmed. An invoice IS the durable record —
// it doesn't disappear once paid, it just changes status, the same way a
// `clients`/`deals` doc in crm.js persists indefinitely rather than expiring.
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin.js";

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"];

// How long after creation an invoice is considered overdue if it's still
// unpaid — deliberately not a stored status (nothing sweeps old docs to
// flip it), just a cutoff computed at read time by listInvoices()/
// getInvoice() below. That keeps "overdue" always accurate without needing
// any scheduled task, matching how PENDING_DEPOSIT_EXPIRY_DAYS in
// pendingDeposits.js is checked at read time rather than written eagerly.
export const INVOICE_DUE_DAYS = 14;

const COLLECTION = "invoices";

function docToObject(doc) {
	return { id: doc.id, ...doc.data() };
}

// `status === "sent"` and past its due date reads as "overdue" to staff even
// though nothing is written back — see INVOICE_DUE_DAYS above.
function withEffectiveStatus(invoice) {
	const isOverdue = invoice.status === "sent" && invoice.dueAt && new Date(invoice.dueAt) < new Date();
	return { ...invoice, effectiveStatus: isOverdue ? "overdue" : invoice.status };
}

// `fields` should include: jobKey, eventId, visitDate, jobNumber, clientName,
// clientEmail, clientPhone, serviceType (a QUOTE_SERVICE_TYPES key), and
// amount. Everything else here just supplies sane defaults.
export async function createInvoice(fields) {
	const db = getDb();
	const now = FieldValue.serverTimestamp();
	const dueAt = new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const ref = await db.collection(COLLECTION).add({
		jobKey: "",
		eventId: "",
		visitDate: "",
		jobNumber: "",
		clientName: "",
		clientEmail: "",
		clientPhone: "",
		serviceType: "",
		amount: 0,
		notes: "",
		status: "draft",
		dueAt,
		stripeSessionId: "",
		...fields,
		createdAt: now,
		updatedAt: now,
	});
	return ref.id;
}

export async function listInvoices({ status } = {}) {
	const db = getDb();
	let query = db.collection(COLLECTION).orderBy("createdAt", "desc");
	if (status) query = query.where("status", "==", status);
	const snapshot = await query.get();
	return snapshot.docs.map((doc) => withEffectiveStatus(docToObject(doc)));
}

export async function getInvoice(id) {
	const db = getDb();
	const doc = await db.collection(COLLECTION).doc(id).get();
	if (!doc.exists) return null;
	return withEffectiveStatus(docToObject(doc));
}

// For every non-payment edit: amount/notes/dueAt corrections, or an admin
// voiding an invoice by hand.
export async function updateInvoice(id, fields) {
	const db = getDb();
	await db
		.collection(COLLECTION)
		.doc(id)
		.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

// Staff generating the customer-facing pay link — see
// src/pages/api/admin/invoices/send.js.
export async function markInvoiceSent(id) {
	const db = getDb();
	await db
		.collection(COLLECTION)
		.doc(id)
		.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

// Two ways an invoice gets marked paid: the customer pays through the public
// /pay/[id] page (Stripe webhook calls this with a real session id), or
// staff mark it paid by hand for an offline payment (check/cash) with no
// session id — `paymentMethod` distinguishes the two on the admin page.
export async function markInvoicePaid(id, { stripeSessionId, paymentMethod = "stripe" } = {}) {
	const db = getDb();
	await db
		.collection(COLLECTION)
		.doc(id)
		.update({
			status: "paid",
			stripeSessionId: stripeSessionId || "",
			paymentMethod,
			paidAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		});
}
