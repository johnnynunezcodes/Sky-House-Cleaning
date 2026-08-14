// Public (no admin auth — this is the endpoint the CUSTOMER's browser calls
// from /confirm/[id].astro). Takes a pendingBooking someone confirmed and
// checked the policy box on, and actually starts a Stripe Checkout Session
// for it — this is the one and only point where a phone-in booking becomes
// a real, payable session, matching the invariant every other booking path
// already follows (nothing charged or put on the calendar until Stripe's
// webhook sees a completed payment).
//
// Deliberately does NOT duplicate the pricing/metadata/slot-check logic from
// /api/create-checkout-session.js — it calls that handler directly (as a
// plain function, not a network round trip) with the pendingBooking's stored
// selections/customer/slot, so a phone booking goes through exactly the same
// server-side price recomputation and slot-conflict check a customer typing
// their own card number would. The only thing this file adds is validating
// the pendingBooking itself (exists, not expired, not already used) and the
// policy checkbox.
export const prerender = false;

import { getPendingBooking } from "../../../lib/pendingBookings.js";
import { isConfigured as isFirebaseConfigured } from "../../../lib/firebaseAdmin.js";
import { policyFor } from "../../../lib/policies.js";
import { POST as createCheckoutSession } from "../create-checkout-session.js";

export async function POST({ request }) {
	if (!isFirebaseConfigured()) {
		return json({ error: "This page isn't configured yet. Please call us to complete your booking." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request." }, 400);
	}

	const { id, policyAgreed } = body || {};
	if (!id) {
		return json({ error: "Missing booking id." }, 400);
	}

	let pending;
	try {
		pending = await getPendingBooking(id);
	} catch (err) {
		return json({ error: "Couldn't load this booking: " + err.message }, 500);
	}

	if (!pending) {
		return json({ error: "We couldn't find that booking. The link may be incorrect." }, 404);
	}
	if (pending.status === "converted") {
		return json({ error: "This booking has already been confirmed and paid for." }, 409);
	}
	if (pending.expiresAt && new Date(pending.expiresAt) < new Date()) {
		return json({ error: "This link has expired. Please call us and we'll send a new one." }, 410);
	}

	// Same policy re-derivation create-checkout-session.js does — never trust
	// anything about *which* policy applies from the client, only whether the
	// box was actually checked.
	const policy = policyFor({ type: pending.selections?.type, frequency: pending.selections?.frequency });
	if (policy && policyAgreed !== true) {
		return json({ error: "Please check the box confirming you agree to the policy before continuing." }, 400);
	}

	const origin = new URL(request.url).origin;
	const syntheticRequest = new Request(`${origin}/api/create-checkout-session`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			selections: pending.selections,
			customer: pending.customer,
			slot: pending.slot,
			// The customer just checked this box on THIS page, right now — this
			// is the real consent event this whole flow exists to capture.
			policyAgreed: true,
			// Rides along in the Stripe session's metadata so stripe-webhook.js
			// can mark this pendingBooking "converted" at the one moment that
			// actually matters: real payment confirmation, not just a checkout
			// session existing (see the comment below on why we don't mark it
			// converted here).
			pendingBookingId: id,
		}),
	});

	let checkoutResponse;
	let checkoutData;
	try {
		checkoutResponse = await createCheckoutSession({ request: syntheticRequest });
		checkoutData = await checkoutResponse.json();
	} catch (err) {
		return json({ error: "Something went wrong starting checkout: " + err.message }, 500);
	}

	if (!checkoutResponse.ok || !checkoutData?.url) {
		// Bubble up create-checkout-session.js's own message (e.g. "that time
		// was just booked by someone else") rather than a generic one — it's
		// already written to be customer-facing.
		return json({ error: checkoutData?.error || "Something went wrong starting checkout." }, checkoutResponse.status || 500);
	}

	// Deliberately NOT marking this pendingBooking "converted" here — a
	// Checkout Session existing just means the customer clicked Confirm and
	// got redirected to Stripe, not that they actually paid. Marking it done
	// at this point was the original (buggy) version of this file: if the
	// customer then hit the browser back button, closed the tab, or Stripe
	// declined their card, this link would permanently show "already
	// confirmed and paid for" even though nothing was ever charged, with no
	// way to retry. Instead, stripe-webhook.js marks it converted inside its
	// `checkout.session.completed` handler — the one moment the codebase
	// already treats as "the customer actually paid" everywhere else (that's
	// also when the real calendar event gets created). Until then this
	// pendingBooking just stays "pending", so re-opening the same confirm
	// link after an abandoned checkout lets the customer simply try again.
	return json({ url: checkoutData.url });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
