// Password-gates the internal staff tools under /admin and /api/admin —
// these can move real calendar events and edit live subscriptions, so they
// can never be public. Uses plain HTTP Basic Auth (the browser's built-in
// login prompt) rather than a custom login page or session system, since
// this is a low-traffic internal tool for one or two staff members, not a
// customer-facing feature.
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;
	const isProtected = url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin");
	if (!isProtected) return next();

	const username = import.meta.env.ADMIN_USERNAME;
	const password = import.meta.env.ADMIN_PASSWORD;

	if (!username || !password) {
		return new Response(
			"Staff tools aren't configured yet — ADMIN_USERNAME and ADMIN_PASSWORD need to be set. See AGENTS.md.",
			{ status: 503 },
		);
	}

	const authHeader = request.headers.get("authorization");
	if (authHeader?.startsWith("Basic ")) {
		try {
			const decoded = atob(authHeader.slice("Basic ".length));
			const separatorIndex = decoded.indexOf(":");
			const providedUser = decoded.slice(0, separatorIndex);
			const providedPass = decoded.slice(separatorIndex + 1);
			if (providedUser === username && providedPass === password) {
				return next();
			}
		} catch {
			// Fall through to the 401 below on any decoding error.
		}
	}

	return new Response("Authentication required.", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="Sky House Cleaning Staff Tools"' },
	});
});
