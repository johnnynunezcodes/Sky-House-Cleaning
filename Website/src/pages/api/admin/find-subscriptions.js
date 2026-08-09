// Staff-only lookup used by /admin/reschedule to find a customer's active
// recurring plan(s) by email before rescheduling. Gated by the Basic Auth
// middleware (src/middleware.js) — never reachable without the admin
// credentials.
export const prerender = false;

import Stripe from "stripe";

export async function GET({ url }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Stripe isn't configured." }, 500);
	}

	const email = url.searchParams.get("email")?.trim();
	if (!email) {
		return json({ error: "Enter a customer email to search." }, 400);
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	try {
		const customers = await stripe.customers.list({ email, limit: 10 });

		const subscriptions = [];
		for (const customer of customers.data) {
			const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 10 });
			for (const sub of subs.data) {
				const metadata = sub.metadata || {};
				subscriptions.push({
					subscriptionId: sub.id,
					customerEmail: customer.email,
					name: metadata.name || "",
					phone: metadata.phone || "",
					address: metadata.address || "",
					frequency: metadata.frequency || "",
					type: metadata.type || "",
					sqft: metadata.sqft || "",
					lastVisitStart: metadata.lastVisitStart || "",
					lastVisitEnd: metadata.lastVisitEnd || "",
				});
			}
		}

		return json({ subscriptions });
	} catch (err) {
		return json({ error: "Couldn't search Stripe: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
