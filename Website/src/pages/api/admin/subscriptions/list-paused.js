// Staff-only: powers the Jobs page's "Action Required" panel — every
// recurring plan currently on hold. See AGENTS.md → "Jobs (formerly
// Dispatcher)" for why "Action Required" and "on hold" are the same thing
// here (Jobber's own help docs describe Action Required as basically their
// on-hold concept, and this app never built a separate status for it).
//
// A paused plan's Stripe `status` stays "active"/"trialing" — pausing sets
// `pause_collection`, it doesn't change status — so the only reliable way
// to find these is to fetch every live subscription and check that field,
// same approach /admin/minimum-commitments.astro already uses for its own
// full-roster read.
export const prerender = false;

import Stripe from "stripe";

export async function GET() {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Stripe isn't configured." }, 500);
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	try {
		const list = await stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] });

		const paused = list.data
			.filter((sub) => sub.pause_collection && (sub.status === "active" || sub.status === "trialing"))
			.map((sub) => {
				const metadata = sub.metadata || {};
				return {
					subscriptionId: sub.id,
					email: sub.customer && !sub.customer.deleted ? sub.customer.email || "" : "",
					name: metadata.name || "",
					phone: metadata.phone || "",
					frequency: metadata.frequency || "",
					// Stripe stores this as a Unix timestamp (seconds) on the pause
					// object itself — "resumes_at" is only set if a specific
					// resume date was chosen; this app's toggle-hold.js never sets
					// one (an indefinite hold until staff manually resume it), so
					// this will normally be null.
					resumesAt: sub.pause_collection.resumes_at
						? new Date(sub.pause_collection.resumes_at * 1000).toISOString()
						: null,
				};
			});

		return json({ paused });
	} catch (err) {
		return json({ error: "Couldn't load paused plans: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
