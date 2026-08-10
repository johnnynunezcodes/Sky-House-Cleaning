// Live Google reviews for the /reviews page, pulled from the Places API
// (New) "Place Details" endpoint using the business's Place ID.
//
// This is a plain Google Cloud API key (unrelated to the service-account
// credentials googleCalendar.js uses) — see AGENTS.md for the one-time
// setup: enabling "Places API (New)" in Google Cloud Console, linking a
// billing account, generating the key, and finding the Place ID. It's read
// server-side only via `import.meta.env` inside a `prerender = false` page
// (src/pages/reviews.astro), so it's never sent to the browser or bundled
// into client JS.
const FIELD_MASK = "id,displayName,rating,userRatingCount,googleMapsUri,reviews";

// Reviews don't change minute to minute, and Places API billing is
// usage-based — caching in memory cuts down on repeat calls within the same
// warm serverless instance. This resets on cold starts (Vercel functions
// aren't guaranteed to stay warm), so it's a soft cap on request volume,
// not a hard one — that's fine here, it just smooths out bursts of traffic.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache = null;
let cachedAt = 0;

export function isConfigured() {
	return Boolean(import.meta.env.GOOGLE_PLACES_API_KEY && import.meta.env.GOOGLE_PLACE_ID);
}

// The "Leave Us a Review" link on /reviews. Prefers GOOGLE_REVIEW_URL — the
// "Get more reviews" share link from Business Profile Manager (business.google.com),
// which is generated directly from the verified account and needs no Place ID
// at all. Falls back to building the standard write-review URL from
// GOOGLE_PLACE_ID if that's ever set instead. Deliberately independent of the
// live-reviews fetch below (and of whether a Place ID has been found), so
// this button works even while that's unresolved — see AGENTS.md.
export function writeReviewUrl() {
	const reviewUrl = import.meta.env.GOOGLE_REVIEW_URL;
	if (reviewUrl) return reviewUrl;

	const placeId = import.meta.env.GOOGLE_PLACE_ID;
	if (!placeId) return null;
	return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * @returns {Promise<{
 *   rating: number|null,
 *   userRatingCount: number|null,
 *   mapsUri: string|null,
 *   reviews: { authorName: string, authorPhotoUrl: string|null, rating: number|null, relativeTime: string, text: string }[]
 * }>}
 */
export async function getGoogleReviews() {
	if (!isConfigured()) throw new Error("Google Places isn't configured yet.");

	if (cache && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cache;
	}

	const apiKey = import.meta.env.GOOGLE_PLACES_API_KEY;
	const placeId = import.meta.env.GOOGLE_PLACE_ID;

	const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
		headers: {
			"X-Goog-Api-Key": apiKey,
			"X-Goog-FieldMask": FIELD_MASK,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Places API request failed (${response.status}): ${body.slice(0, 300)}`);
	}

	const data = await response.json();

	const result = {
		rating: typeof data.rating === "number" ? data.rating : null,
		userRatingCount: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
		mapsUri: data.googleMapsUri || null,
		// The API returns at most 5 reviews and Google chooses which ones —
		// every review it returns is shown as-is, in the order given, with no
		// filtering or reordering on our end. Google Maps Platform's content
		// policies require displaying review content unaltered rather than
		// cherry-picking a subset, so don't add any sorting/filtering here.
		reviews: (data.reviews || []).map((r) => ({
			authorName: r.authorAttribution?.displayName || "Google user",
			authorPhotoUrl: r.authorAttribution?.photoUri || null,
			rating: typeof r.rating === "number" ? r.rating : null,
			relativeTime: r.relativePublishTimeDescription || "",
			text: r.text?.text || r.originalText?.text || "",
		})),
	};

	cache = result;
	cachedAt = Date.now();
	return result;
}
