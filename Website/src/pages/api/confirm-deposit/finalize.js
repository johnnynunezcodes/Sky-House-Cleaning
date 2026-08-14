// Public (no admin auth — this is the endpoint the CUSTOMER's browser calls
// from /confirm-deposit/[id].astro). Creates a one-time Stripe Checkout
// Session for the deposit amount and returns its URL.
//
// Deliberately does NOT go through create-checkout-session.js /
// calculatePrice() — that path exists specifically to stop a client-supplied
// dollar amount from ever being trusted for the catalog services. This is a
// different situation: the deposit amount was fixed by STAFF, server-side,
// at job-creation time (see create-quote-job.js), and stored in Firestore.
// The customer's browser never sends a dollar figure here at all — this
// endpoint only re-reads the already-fixed depositAmount off the
// pendingDeposit record and builds an ad-hoc Stripe line item
// (`price_data`) from it. Using Stripe's ad-hoc price_data (rather than a
// pre-created Stripe Product/Price) is the natural fit for a one-off,
// staff-quoted amount — there's no reusable catalog price to reference.
export const prerender = false;

import Stripe from "stripe";
import { getPendingDeposit } from "../../../lib/pendingDeposits.js";
import { isConfigured as isFirebaseConfigured } from "../../../lib/firebaseAdmin.js";
import { QUOTE_SERVICE_TYPES } from "../../../data/booking.js";

export async function POST({ request }) {
	if (!isFirebaseConfigured()) {
		return json({ error: "This page isn't configured yet. Please call us to complete your deposit." }, 500);
	}

	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Payments aren't configured yet. Please call us to complete your deposit." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request." }, 400);
	}

	const { id, agreed } = body || {};
	if (!id) {
		return json({ error: "Missing deposit id." }, 400);
	}
	if (agreed !== true) {
		return json({ error: "Please check the box confirming the details before continuing." }, 400);
	}

	let pending;
	try {
		pending = await getPendingDeposit(id);
	} catch (err) {
		return json({ error: "Couldn't load this request: " + err.message }, 500);
	}

	if (!pending) {
		return json({ error: "We couldn't find that request. The link may be incorrect." }, 404);
	}
	if (pending.status === "paid") {
		return json({ error: "This deposit has already been paid." }, 409);
	}
	if (pending.expiresAt && new Date(pending.expiresAt) < new Date()) {
		return json({ error: "This link has expired. Please call us and we'll send a new one." }, 410);
	}

	const depositAmount = Number(pending.depositAmount) || 0;
	if (depositAmount <= 0) {
		return json({ error: "This deposit amount looks invalid — please call us to sort it out." }, 400);
	}

	const serviceLabel = QUOTE_SERVICE_TYPES[pending.serviceType] || pending.serviceType || "Job";
	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
	const origin = new URL(request.url).origin;

	try {
		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			customer_email: pending.customer?.email || undefined,
			line_items: [
				{
					price_data: {
						currency: "usd",
						product_data: {
							name: `Deposit — ${serviceLabel}`,
							description: `${pending.customer?.name || "Customer"} · Sky House Cleaning`,
						},
						unit_amount: Math.round(depositAmount * 100),
					},
					quantity: 1,
				},
			],
			success_url: `${origin}/confirm-deposit/success?session_id={CHECKOUT_SESSION_ID}`,
			// Stripe's own "‹ Back" link, same reasoning as
			// finalize-pending-booking.js's cancel_url: send them back to the
			// same confirm-deposit page (still "pending," ready to retry)
			// rather than a generic canceled page that doesn't know anything
			// about this request.
			cancel_url: `${origin}/confirm-deposit/${id}`,
			metadata: {
				// Distinct key from pendingBookingId so stripe-webhook.js can
				// tell a deposit session apart from a catalog booking session —
				// they're handled by two entirely separate branches there.
				depositId: id,
				jobKey: pending.jobKey || "",
			},
		});

		return json({ url: session.url });
	} catch (err) {
		console.error("Deposit checkout session creation failed:", err?.message, err?.raw?.message);
		return json({ error: "We couldn't start payment. Please try again or give us a call." }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
