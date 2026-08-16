// Public (no admin auth — called from /pay/[id].astro). Creates a one-time
// Stripe Checkout Session for an invoice's amount and returns its URL.
//
// Same reasoning as /api/confirm-deposit/finalize.js for using ad-hoc
// `price_data` instead of create-checkout-session.js/calculatePrice(): the
// amount here was fixed by STAFF (set when the invoice was created/edited in
// /admin/invoices, ultimately derived from the job's own quoted total), not
// supplied by the customer's browser — this endpoint only re-reads the
// already-fixed `amount` off the invoice record.
export const prerender = false;

import Stripe from "stripe";
import { getInvoice } from "../../../lib/invoices.js";
import { isConfigured as isFirebaseConfigured } from "../../../lib/firebaseAdmin.js";
import { QUOTE_SERVICE_TYPES } from "../../../data/booking.js";

export async function POST({ request }) {
	if (!isFirebaseConfigured()) {
		return json({ error: "This page isn't configured yet. Please call us to pay your invoice." }, 500);
	}

	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Payments aren't configured yet. Please call us to pay your invoice." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request." }, 400);
	}

	const { id } = body || {};
	if (!id) {
		return json({ error: "Missing invoice id." }, 400);
	}

	let invoice;
	try {
		invoice = await getInvoice(id);
	} catch (err) {
		return json({ error: "Couldn't load this invoice: " + err.message }, 500);
	}

	if (!invoice) {
		return json({ error: "We couldn't find that invoice. The link may be incorrect." }, 404);
	}
	if (invoice.status === "paid") {
		return json({ error: "This invoice has already been paid." }, 409);
	}
	if (invoice.status === "void") {
		return json({ error: "This invoice is no longer valid. Please call us." }, 409);
	}

	const amount = Number(invoice.amount) || 0;
	if (amount <= 0) {
		return json({ error: "This invoice amount looks invalid — please call us to sort it out." }, 400);
	}

	const serviceLabel = QUOTE_SERVICE_TYPES[invoice.serviceType] || invoice.serviceType || "Job";
	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
	const origin = new URL(request.url).origin;

	try {
		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			customer_email: invoice.clientEmail || undefined,
			line_items: [
				{
					price_data: {
						currency: "usd",
						product_data: {
							name: `Invoice${invoice.jobNumber ? ` #${invoice.jobNumber}` : ""} — ${serviceLabel}`,
							description: `${invoice.clientName || "Customer"} · Sky House Cleaning`,
						},
						unit_amount: Math.round(amount * 100),
					},
					quantity: 1,
				},
			],
			success_url: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
			// Same reasoning as confirm-deposit/finalize.js's cancel_url: send
			// them back to this same invoice page (still "sent," ready to retry)
			// rather than a generic canceled page that knows nothing about it.
			cancel_url: `${origin}/pay/${id}`,
			metadata: {
				// Distinct key from depositId/pendingBookingId so stripe-webhook.js
				// can tell an invoice payment apart from those other flows.
				invoiceId: id,
			},
		});

		return json({ url: session.url });
	} catch (err) {
		console.error("Invoice checkout session creation failed:", err?.message, err?.raw?.message);
		return json({ error: "We couldn't start payment. Please try again or give us a call." }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
