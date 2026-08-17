// Staff-only: puts a recurring client's plan on hold, or takes them off
// hold — the real mechanism behind the Jobs page's "Action Required" status
// (see list-paused.js and AGENTS.md → "Jobs"). Pausing sets Stripe's
// `pause_collection` with `behavior: "void"`, which means Stripe simply
// never generates an invoice while paused — no charge, and (just as
// importantly) no `invoice.paid` webhook fires, so stripe-webhook.js's
// renewal branch never creates the plan's next calendar visit either.
// Nothing about the already-existing current/next visit on the calendar
// changes — if staff also want that one cancelled, that's a separate,
// deliberate action (the existing "Cancel a specific visit" tool), not
// something a hold does automatically.
export const prerender = false;

import Stripe from "stripe";

export async function POST({ request }) {
	const secretKey = import.meta.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: "Stripe isn't configured." }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body." }, 400);
	}

	const { hold, clientEmail, subscriptionId } = body || {};
	if (typeof hold !== "boolean") {
		return json({ error: "Missing hold (true/false)." }, 400);
	}

	const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

	try {
		if (hold) {
			// Putting a plan ON hold — staff act from a specific job on the Jobs
			// page, which only has the client's email (see clientEmail on
			// list-jobs.js), not a subscription id, so it has to be looked up
			// the same way /admin/reschedule's find-subscriptions.js does.
			if (!clientEmail) {
				return json({ error: "Missing clientEmail." }, 400);
			}
			const customers = await stripe.customers.list({ email: clientEmail, limit: 10 });
			const live = [];
			for (const customer of customers.data) {
				const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
				for (const sub of subs.data) {
					if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
					if (sub.pause_collection) continue; // already on hold
					live.push(sub);
				}
			}
			if (live.length === 0) {
				return json({ error: "No active recurring plan found for this client to put on hold." }, 404);
			}
			if (live.length > 1) {
				return json(
					{ error: "This client has more than one active plan — use Manage Plans to pick the right one." },
					409,
				);
			}
			await stripe.subscriptions.update(live[0].id, { pause_collection: { behavior: "void" } });
			return json({ ok: true, subscriptionId: live[0].id });
		}

		// Taking a plan OFF hold — the Action Required panel already has the
		// exact subscriptionId from list-paused.js, no lookup needed.
		if (!subscriptionId) {
			return json({ error: "Missing subscriptionId." }, 400);
		}
		await stripe.subscriptions.update(subscriptionId, { pause_collection: "" });
		return json({ ok: true });
	} catch (err) {
		return json({ error: "Couldn't update the plan's hold status: " + err.message }, 500);
	}
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
