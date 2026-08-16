// Deprecated — superseded by /api/admin/quotes/create.js, which sends a
// quote WITHOUT creating a calendar event immediately (see AGENTS.md →
// "Requests & Quotes" for why: staff now wait for the customer to accept
// before a job/date exists at all). Kept here as a dead endpoint rather
// than deleted, since files in this project can't be removed, only
// overwritten. /admin/book-quote.astro was updated to call the new
// endpoint, so nothing in the app should ever reach this anymore.
export const prerender = false;

export async function POST() {
	return new Response(
		JSON.stringify({
			error: "This endpoint has moved. Quotes are now created via /api/admin/quotes/create.js — see AGENTS.md.",
		}),
		{ status: 410, headers: { "Content-Type": "application/json" } },
	);
}
