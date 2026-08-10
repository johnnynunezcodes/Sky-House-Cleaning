// Maps a booking's service type + frequency to the policy page that governs
// it, and (for recurring plans) the minimum-commitment term from that
// policy. Single source of truth for the checkout flow
// (create-checkout-session.js, book.astro) and the admin tool
// (find-subscriptions.js) — update here, not in multiple places, when a
// policy's minimum commitment changes or a new policy page is added.
//
// Source content for every page here lives in the top-level project vault
// under `Policies/` — that's where Johnny writes/edits policy text; these
// pages are the published copy customers actually see and agree to. Keep
// them in sync by hand when the vault changes.

export const MINIMUM_COMMITMENT = {
	weekly: 8,
	biweekly: 4,
	monthly: 3,
};

// Exported (not just used internally) so book.astro can pass this same data
// down to its client-side script via `define:vars` — the type/frequency the
// customer picked is only known in the browser (parsed from the `?s=` query
// param after the static page loads), so the lookup has to happen there too.
// Keep the actual policy paths/labels/commitment numbers defined once, here.
export const RECURRING_POLICIES = {
	weekly: { path: "/policies/weekly-membership", label: "Weekly Membership Policy" },
	biweekly: { path: "/policies/biweekly-membership", label: "Bi-Weekly Membership Policy" },
	monthly: { path: "/policies/monthly-membership", label: "Monthly Membership Policy" },
};

export const ONE_TIME_POLICIES = {
	standard: { path: "/policies/one-time-standard-cleaning", label: "One-Time Standard Cleaning Policy" },
	deep: { path: "/policies/deep-cleaning", label: "Deep Cleaning Policy" },
	moveInOut: { path: "/policies/move-in-move-out-cleaning", label: "Move-In / Move-Out Cleaning Policy" },
};

/**
 * @param {{ type?: string, frequency?: string }} selections
 * @returns {{ path: string, label: string, minimumCommitment: number|null, frequency: string|null } | null}
 */
export function policyFor({ type = "standard", frequency = "oneTime" } = {}) {
	if (type === "standard" && frequency !== "oneTime" && RECURRING_POLICIES[frequency]) {
		return {
			...RECURRING_POLICIES[frequency],
			minimumCommitment: MINIMUM_COMMITMENT[frequency] ?? null,
			frequency,
		};
	}
	if (ONE_TIME_POLICIES[type]) {
		return { ...ONE_TIME_POLICIES[type], minimumCommitment: null, frequency: null };
	}
	return null;
}
