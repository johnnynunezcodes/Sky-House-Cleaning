// Returns open booking slots for a given date + cleaning type. Called by the
// date/time picker on /book as the customer browses days.
export const prerender = false;

import { getAvailableSlots, isConfigured } from "../../lib/googleCalendar.js";

export async function GET({ url }) {
	if (!isConfigured()) {
		return new Response(
			JSON.stringify({
				error: "Online scheduling isn't fully set up yet. Please call us to book.",
			}),
			{ status: 503, headers: { "Content-Type": "application/json" } },
		);
	}

	const dateStr = url.searchParams.get("date");
	const type = url.searchParams.get("type") || "standard";

	if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return new Response(JSON.stringify({ error: "A valid date is required." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const slots = await getAvailableSlots({ dateStr, type });
		return new Response(JSON.stringify({ slots }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		// Logged so the real cause (bad credentials, missing Domain-Wide
		// Delegation, malformed private key, etc.) shows up in Vercel's
		// function logs instead of just a generic 500 on the client.
		console.error("Failed to load availability:", err?.message, err?.response?.data || "");
		return new Response(
			JSON.stringify({ error: "Couldn't load availability right now. Please try again." }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
}
