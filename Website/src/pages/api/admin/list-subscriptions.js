// Staff-only: every active recurring plan, in the same shape
// find-subscriptions.js returns per subscription (subscriptionId, name,
// frequency, lastVisitStart, etc.) — used by /admin/reschedule's customer
// dropdown and mini-calendar so both can render a selected plan through the
// exact same renderResults() path the email search already uses, with no
// second network round trip once this list has loaded. Read-heavy sibling
// of minimum-commitments.astro's own "fetch every subscription" query;
// kept as a separate endpoint (rather than having reschedule.astro reuse
// that page's inline Stripe call) since this needs to be fetched
// client-side on an interactive page, not rendered once per request.
export const prerender = false;

import Stripe from "stripe";
import { nextVisitWindow } from "../../../lib/pricing.js";
import { MINIMUM_COMMITMENT } from "../../../lib/policies.js";

export async function GET() {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Stripe isn't configured." }, 500);
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	try {
		// Same "few enough plans for one page" assumption minimum-commitments.astro
		// makes — revisit with autoPagingEach if the active-plan count ever
		// approaches Stripe's max limit of 100.
		const list = await stripe.subscriptions.list({
			status: "all",
			limit: 100,
			expand: ["data.customer"],
		});

		const subscriptions = [];
		for (const sub of list.data) {
			// Same "still a live plan" filter find-subscriptions.js uses —
			// "trialing" included since billing re-anchoring briefly puts a
			// subscription there (see AGENTS.md → Billing date alignment).
			if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;

			const metadata = sub.metadata || {};
			if (!metadata.frequency) continue; // not a recurring plan of any kind

			const nextStop =
				metadata.lastVisitStart && metadata.lastVisitEnd && metadata.frequency
					? nextVisitWindow(metadata.lastVisitStart, metadata.lastVisitEnd, metadata.frequency)
					: null;

			subscriptions.push({
				subscriptionId: sub.id,
				customerEmail: sub.customer && !sub.customer.deleted ? sub.customer.email || "" : "",
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

		subscriptions.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

		return json({ subscriptions });
	} catch (err) {
		return json({ error: "Couldn't load subscriptions from Stripe: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
