// Staff-only lookup used by /admin/reschedule to find a customer's active
// recurring plan(s) by email before rescheduling. Gated by the Basic Auth
// middleware (src/middleware.js) — never reachable without the admin
// credentials.
export const prerender = false;

import Stripe from "stripe";
import { nextVisitWindow } from "../../../lib/pricing.js";
import { MINIMUM_COMMITMENT } from "../../../lib/policies.js";

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
			// `status: "active"` alone is too narrow here — this app briefly
			// puts a subscription into "trialing" every time billing gets
			// re-anchored to a new date (skip-visit.js, reschedule-subscription.js;
			// see "Billing date alignment" in AGENTS.md), which is expected and
			// harmless, but a plain active-only search would make staff unable
			// to find a plan right after using those tools. Fetch every status
			// and just filter out the ones that are actually done.
			const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
			for (const sub of subs.data) {
				if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;

				const metadata = sub.metadata || {};

				// The visit after the currently-scheduled one — used to prefill a
				// sensible default in the admin UI's "cancel on a date" tool, so
				// the already-scheduled next visit still happens and gets billed,
				// and the plan stops right before the one after that.
				const nextStop =
					metadata.lastVisitStart && metadata.lastVisitEnd && metadata.frequency
						? nextVisitWindow(metadata.lastVisitStart, metadata.lastVisitEnd, metadata.frequency)
						: null;

				subscriptions.push({
					subscriptionId: sub.id,
					customerEmail: customer.email,
					status: sub.status,
					name: metadata.name || "",
					phone: metadata.phone || "",
					address: metadata.address || "",
					frequency: metadata.frequency || "",
					type: metadata.type || "",
					sqft: metadata.sqft || "",
					lastVisitStart: metadata.lastVisitStart || "",
					lastVisitEnd: metadata.lastVisitEnd || "",
					afterNextVisitStart: nextStop?.start || "",
					completedVisitCount: parseInt(metadata.completedVisitCount || "0", 10) || 0,
					minimumCommitment: MINIMUM_COMMITMENT[metadata.type || "standard"]?.[metadata.frequency] ?? null,
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
