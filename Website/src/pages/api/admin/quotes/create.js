// Staff-only: sends a formal quote for a custom-priced job (commercial/
// office cleaning, garage cleaning & organization, post-construction
// cleaning). Supersedes the old /api/admin/create-quote-job.js, which
// created the calendar event immediately — this endpoint creates NO
// calendar event at all. It only records the quoted price + deposit terms
// and hands back a link for the customer to review and accept. The real
// job only gets created later, once they've accepted (see
// stripe-webhook.js's `metadata.quoteId` branch) and staff have picked an
// actual date/time (/api/admin/quotes/schedule.js). See AGENTS.md →
// "Requests & Quotes" for the full reasoning.
export const prerender = false;

import { QUOTE_SERVICE_TYPES } from "../../../../data/booking.js";
import { createQuote } from "../../../../lib/quotes.js";
import { isConfigured as isFirebaseConfigured } from "../../../../lib/firebaseAdmin.js";

const REQUIRED_CUSTOMER_FIELDS = ["name", "phone", "address"];

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

	const { dealId, serviceType, customer, quotedTotal, depositType, depositValue, notes } = body || {};

	if (!QUOTE_SERVICE_TYPES[serviceType]) {
		return json({ error: "Please choose a service type." }, 400);
	}
	const missingField = REQUIRED_CUSTOMER_FIELDS.find((field) => !customer?.[field]);
	if (missingField) {
		return json({ error: "Please fill in the customer's name, phone, and address." }, 400);
	}
	const total = Number(quotedTotal);
	if (!total || total <= 0) {
		return json({ error: "Please enter the quoted total." }, 400);
	}
	if (depositType !== "percentage" && depositType !== "fixed") {
		return json({ error: "Please choose how the deposit is calculated." }, 400);
	}
	const rawDepositValue = Number(depositValue);
	if (!rawDepositValue || rawDepositValue <= 0) {
		return json({ error: "Please enter a deposit amount." }, 400);
	}
	if (depositType === "percentage" && rawDepositValue > 100) {
		return json({ error: "Deposit percentage can't be more than 100." }, 400);
	}

	// Same "never trust a pre-computed number" principle every other booking
	// endpoint in this app follows — derived server-side from the quoted
	// total staff just entered, not from a dollar figure the browser sent.
	const depositAmount =
		depositType === "percentage"
			? Math.round(total * (rawDepositValue / 100) * 100) / 100
			: Math.min(Math.round(rawDepositValue * 100) / 100, total);

	let quoteId;
	try {
		quoteId = await createQuote({
			dealId: dealId || "",
			serviceType,
			customer,
			quotedTotal: total,
			depositType,
			depositValue: rawDepositValue,
			depositAmount,
			notes: notes || "",
		});
	} catch (err) {
		return json({ error: "Couldn't create the quote: " + err.message }, 500);
	}

	const origin = new URL(request.url).origin;
	return json({ quoteId, confirmUrl: `${origin}/confirm-quote/${quoteId}` });
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
