// Public (no admin auth — called from /confirm-quote/[id].astro). Creates a
// one-time Stripe Checkout Session for the quote's deposit amount. Adapted
// from the old /api/confirm-deposit/finalize.js — same ad-hoc `price_data`
// reasoning (the amount was fixed by staff server-side at quote-creation
// time, never trusted from the browser).
export const prerender = false;

import Stripe from "stripe";
import { getQuote } from "../../../lib/quotes.js";
import { isConfigured as isFirebaseConfigured } from "../../../lib/firebaseAdmin.js";
import { QUOTE_SERVICE_TYPES } from "../../../data/booking.js";

export async function POST({ request }) {
	if (!isFirebaseConfigured()) {
		return json({ error: "This page isn't configured yet. Please call us to accept your quote." }, 500);
	}

	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Payments aren't configured yet. Please call us to accept your quote." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request." }, 400);
	}

	const { id, agreed } = body || {};
	if (!id) {
		return json({ error: "Missing quote id." }, 400);
	}
	if (agreed !== true) {
		return json({ error: "Please check the box confirming the details before continuing." }, 400);
	}

	let quote;
	try {
		quote = await getQuote(id);
	} catch (err) {
		return json({ error: "Couldn't load this quote: " + err.message }, 500);
	}

	if (!quote) {
		return json({ error: "We couldn't find that quote. The link may be incorrect." }, 404);
	}
	if (quote.status !== "pending") {
		return json({ error: "This quote is no longer available to accept." }, 409);
	}
	if (quote.expiresAt && new Date(quote.expiresAt) < new Date()) {
		return json({ error: "This link has expired. Please call us and we'll send a new one." }, 410);
	}

	const depositAmount = Number(quote.depositAmount) || 0;
	if (depositAmount <= 0) {
		return json({ error: "This deposit amount looks invalid — please call us to sort it out." }, 400);
	}

	const serviceLabel = QUOTE_SERVICE_TYPES[quote.serviceType] || quote.serviceType || "Job";
	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
	const origin = new URL(request.url).origin;

	try {
		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			customer_email: quote.customer?.email || undefined,
			line_items: [
				{
					price_data: {
						currency: "usd",
						product_data: {
							name: `Deposit — ${serviceLabel}`,
							description: `${quote.customer?.name || "Customer"} · Sky House Cleaning`,
						},
						unit_amount: Math.round(depositAmount * 100),
					},
					quantity: 1,
				},
			],
			success_url: `${origin}/confirm-quote/success?session_id={CHECKOUT_SESSION_ID}`,
			// Same reasoning as every other flow's cancel_url: send them back to
			// this same page (still "pending," ready to retry).
			cancel_url: `${origin}/confirm-quote/${id}`,
			metadata: {
				// Distinct key from depositId/pendingBookingId/invoiceId so
				// stripe-webhook.js can tell this flow apart from the others.
				quoteId: id,
			},
		});

		return json({ url: session.url });
	} catch (err) {
		console.error("Quote deposit checkout session creation failed:", err?.message, err?.raw?.message);
		return json({ error: "We couldn't start payment. Please try again or give us a call." }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
