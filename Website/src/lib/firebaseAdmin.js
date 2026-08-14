// Server-side Firestore access for the CRM/dispatcher, using a Firebase
// service account (not the client SDK) — same shape as the Google Calendar
// service account in googleCalendar.js. All CRM admin pages run under
// /admin, which is already gated by Basic Auth in middleware.js, so reads
// and writes here go straight through the Admin SDK (which bypasses
// Firestore security rules) rather than needing a second auth layer. See
// AGENTS.md for the one-time Firebase project setup.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function isConfigured() {
	return Boolean(
		import.meta.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID &&
			import.meta.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL &&
			import.meta.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY,
	);
}

// Lazily initializes the Admin SDK app exactly once per server process.
// Astro/Vercel can invoke this module across multiple requests in the same
// running process, and firebase-admin throws if you call initializeApp()
// more than once, so we check getApps() first rather than guarding with a
// simple module-level boolean (which wouldn't survive hot-reload in dev).
function getApp() {
	const existing = getApps();
	if (existing.length > 0) return existing[0];

	const projectId = import.meta.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID;
	const clientEmail = import.meta.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL;
	const rawKey = import.meta.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;

	if (!projectId || !clientEmail || !rawKey) {
		throw new Error(
			"Firebase isn't configured — FIREBASE_SERVICE_ACCOUNT_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY are missing. See .env.example.",
		);
	}

	// Same \n-escaping issue as the Google Calendar private key: env vars
	// can't hold real newlines, so it's stored with literal "\n" and
	// unescaped here.
	const privateKey = rawKey.replace(/\\n/g, "\n");

	return initializeApp({
		credential: cert({ projectId, clientEmail, privateKey }),
	});
}

// Returns a Firestore instance, ready to use: db.collection("clients"), etc.
export function getDb() {
	return getFirestore(getApp());
}
