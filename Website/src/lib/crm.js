// Data access for the CRM: clients (contacts) and deals (the lead pipeline).
// Thin wrappers around Firestore via firebaseAdmin.js — kept here so the
// admin pages/API routes don't need to know Firestore's collection/field
// names directly, same reasoning as pricing.js and policies.js.
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin.js";

export const LIFECYCLE_STAGES = ["lead", "active_client", "past_client"];

export const DEAL_STAGES = ["new_inquiry", "quote_sent", "follow_up", "won", "lost"];

const CLIENTS_COLLECTION = "clients";
const DEALS_COLLECTION = "deals";

function docToObject(doc) {
	return { id: doc.id, ...doc.data() };
}

// ---- Clients (contacts) ----------------------------------------------

export async function listClients({ lifecycleStage } = {}) {
	const db = getDb();
	let query = db.collection(CLIENTS_COLLECTION).orderBy("name");
	if (lifecycleStage) query = query.where("lifecycleStage", "==", lifecycleStage);
	const snapshot = await query.get();
	return snapshot.docs.map(docToObject);
}

export async function getClient(clientId) {
	const db = getDb();
	const doc = await db.collection(CLIENTS_COLLECTION).doc(clientId).get();
	return doc.exists ? docToObject(doc) : null;
}

// `fields` is a plain object of whichever client properties are known at
// creation time — a lead created from a phone call might only have a name
// and phone number, while a client added after booking online might have
// the full address/access-notes set. Anything not passed just isn't set.
export async function createClient(fields) {
	const db = getDb();
	const now = FieldValue.serverTimestamp();
	const ref = await db.collection(CLIENTS_COLLECTION).add({
		name: "",
		phone: "",
		email: "",
		address: "",
		accessNotes: "",
		petNotes: "",
		stripeCustomerId: "",
		lifecycleStage: "lead",
		leadSource: "",
		...fields,
		createdAt: now,
		updatedAt: now,
	});
	return ref.id;
}

export async function updateClient(clientId, fields) {
	const db = getDb();
	await db
		.collection(CLIENTS_COLLECTION)
		.doc(clientId)
		.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

// ---- Deals (lead pipeline) --------------------------------------------

export async function listDeals({ stage } = {}) {
	const db = getDb();
	let query = db.collection(DEALS_COLLECTION).orderBy("createdAt", "desc");
	if (stage) query = query.where("stage", "==", stage);
	const snapshot = await query.get();
	return snapshot.docs.map(docToObject);
}

export async function getDeal(dealId) {
	const db = getDb();
	const doc = await db.collection(DEALS_COLLECTION).doc(dealId).get();
	return doc.exists ? docToObject(doc) : null;
}

export async function createDeal(fields) {
	const db = getDb();
	const now = FieldValue.serverTimestamp();
	const ref = await db.collection(DEALS_COLLECTION).add({
		contactId: "",
		title: "",
		serviceType: "",
		stage: "new_inquiry",
		estimatedValue: null,
		expectedCloseDate: null,
		lostReason: "",
		notes: "",
		...fields,
		createdAt: now,
		updatedAt: now,
	});
	return ref.id;
}

export async function updateDeal(dealId, fields) {
	const db = getDb();
	await db
		.collection(DEALS_COLLECTION)
		.doc(dealId)
		.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

// Moving a deal to "won" is the moment a lead becomes a real client, so it
// also flips the linked client's lifecycle stage rather than leaving that
// as a separate manual step someone can forget to do.
export async function markDealWon(dealId) {
	const deal = await getDeal(dealId);
	if (!deal) throw new Error(`Deal ${dealId} not found`);
	await updateDeal(dealId, { stage: "won" });
	if (deal.contactId) {
		await updateClient(deal.contactId, { lifecycleStage: "active_client" });
	}
}

export async function markDealLost(dealId, lostReason = "") {
	await updateDeal(dealId, { stage: "lost", lostReason });
}
