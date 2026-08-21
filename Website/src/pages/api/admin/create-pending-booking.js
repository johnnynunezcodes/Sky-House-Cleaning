// Staff-only: step two of the phone-booking flow. Instead of charging (or
// even generating a Stripe payment link for) a customer who isn't the one
// clicking anything, this stores the booking as "pending" and hands back a
// link to the public /confirm/[id] page — the customer has to open that
// themselves, review it, and check the policy box before any Stripe session
// gets created. See AGENTS.md → "Phone booking confirmation link" and
// src/lib/pendingBookings.js for the full reasoning.
export const prerender = false;

import { createPendingBooking } from "../../../lib/pendingBookings.js";
import { isConfigured as isFirebaseConfigured } from "../../../lib/firebaseAdmin.js";
import { isConfigured as isCalendarConfigured, isSlotStillFree } from "../../../lib/googleCalendar.js";

const REQUIRED_CUSTOMER_FIELDS = ["name", "email", "phone", "address", "access"];

export async function POST({ request }) {
	if (!isFirebaseConfigured()) {
		return json({ error: "Firebase isn't configured yet. See AGENTS.md → CRM (Firebase/Firestore)." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { selections, customer, slot } = body || {};

	if (!selections) {
		return json({ error: "Missing quote details. Go back and build the quote again." }, 400);
	}

	const missingField = REQUIRED_CUSTOMER_FIELDS.find((field) => !customer?.[field]);
	if (missingField) {
		return json({ error: "Please fill in all required fields." }, 400);
	}

	if (!slot?.start || !slot?.end) {
		return json({ error: "Please pick a date and time." }, 400);
	}

	// Worth checking here too (not just at confirm time) so staff find out
	// immediately if the slot they just picked is already gone, rather than
	// sending a customer a link that's dead on arrival.
	if (isCalendarConfigured()) {
		try {
			const stillFree = await isSlotStillFree(slot);
			if (!stillFree) {
				return json({ error: "That time was just booked by someone else. Please pick another." }, 409);
			}
		} catch {
			// Don't block on the check itself failing — same tolerance as
			// create-checkout-session.js.
		}
	}

	try {
		const id = await createPendingBooking({ selections, customer, slot });
		const origin = new URL(request.url).origin;
		return json({ id, confirmUrl: `${origin}/confirm/${id}` });
	} catch (err) {
		console.error("Pending booking creation failed:", err?.message);
		return json({ error: "Couldn't create the booking. Please try again." }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
