// Server-side pricing calculator for the booking checkout flow.
//
// The browser (PricingConfigurator.astro) computes and *displays* a price so
// the customer sees a live quote, and encodes their raw selections into the
// `/book?s=...` URL. That encoded payload is a convenience for display only —
// it is NEVER trusted for the actual charge. `calculatePrice()` re-derives
// the price from scratch, purely from `pricingMatrix` / `addOnCatalog` (the
// same source of truth the site itself is built from), so nobody can tamper
// with the amount by editing the URL or the request body.
import {
	pricingMatrix,
	addOnCatalog,
	deepCleanLaundryAddOn,
	laundryUnitTiers,
	applianceQuantityTiers,
} from "../data/content.js";

const FREQUENCY_LABELS = {
	oneTime: "One-Time Cleaning",
	weekly: "Weekly Cleaning",
	biweekly: "Bi-Weekly Cleaning",
	monthly: "Monthly Cleaning",
};

const LAUNDRY_MULTIPLIERS = laundryUnitTiers.map((tier) => tier.multiplier);

function tierIndexFor(sqft) {
	if (sqft < 1000) return 0;
	const idx = 1 + Math.floor((sqft - 1000) / 500);
	return Math.min(idx, pricingMatrix.length - 1);
}

function findCatalogItem(id) {
	for (const group of addOnCatalog) {
		const item = group.items.find((candidate) => candidate.id === id);
		if (item) return item;
	}
	if (id === deepCleanLaundryAddOn.id) return deepCleanLaundryAddOn;
	return null;
}

function describeService(type, frequency) {
	if (type === "deep") return "Deep Cleaning (One-Time)";
	if (type === "moveInOut") return "Move-In / Move-Out Cleaning (One-Time)";
	return FREQUENCY_LABELS[frequency] || FREQUENCY_LABELS.oneTime;
}

function round2(n) {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param {object} selections
 * @param {"oneTime"|"weekly"|"biweekly"|"monthly"} [selections.frequency]
 * @param {"standard"|"deep"|"moveInOut"} [selections.type]
 * @param {number} [selections.sqft]
 * @param {string[]} [selections.addons] - ids of checked flat-price add-ons (standard only)
 * @param {{id: string, qty: number, unitsMultiplier?: number}[]} [selections.steppers] - per-unit add-ons (standard only)
 * @param {{qty: number, unitsMultiplier?: number}} [selections.deepLaundry] - deep-clean laundry add-on
 * @returns {{ total: number, lineItems: {label: string, amount: number}[], sqft: number, frequency: string, type: string }}
 */
export function calculatePrice(selections) {
	const {
		frequency = "oneTime",
		type = "standard",
		sqft = 500,
		addons = [],
		steppers = [],
		deepLaundry = null,
	} = selections || {};

	const safeFrequency = FREQUENCY_LABELS[frequency] ? frequency : "oneTime";
	const clampedSqft = Math.min(Math.max(Number(sqft) || 500, 500), 5999);
	const tier = pricingMatrix[tierIndexFor(clampedSqft)];

	let basePrice;
	if (type === "deep") {
		basePrice = tier.deep;
	} else if (type === "moveInOut") {
		basePrice = tier.moveInOut;
	} else {
		basePrice = tier[safeFrequency] ?? tier.oneTime;
	}

	const lineItems = [{ label: describeService(type, safeFrequency), amount: basePrice }];
	let total = basePrice;

	// Flat-price and per-unit add-ons only apply to the Standard package.
	if (type === "standard" && Array.isArray(addons)) {
		for (const id of addons) {
			const item = findCatalogItem(id);
			if (item && typeof item.price === "number") {
				lineItems.push({ label: item.label, amount: item.price });
				total += item.price;
			}
		}
	}

	if (type === "standard" && Array.isArray(steppers)) {
		for (const entry of steppers) {
			const item = findCatalogItem(entry?.id);
			if (!item || !item.unit) continue;

			const maxQuantity = item.maxQuantity || 10;
			const qty = Math.min(Math.max(Math.floor(Number(entry.qty) || 0), 0), maxQuantity);
			if (qty <= 0) continue;

			let multiplier = 1;
			if (item.hasUnitDiscount) {
				const requested = Number(entry.unitsMultiplier);
				multiplier = LAUNDRY_MULTIPLIERS.includes(requested) ? requested : 1;
			} else if (item.hasQuantityDiscount) {
				const tierIndex = Math.min(Math.max(qty, 1), applianceQuantityTiers.length) - 1;
				multiplier = applianceQuantityTiers[tierIndex] ?? 1;
			}

			const amount = qty * item.pricePerUnit * multiplier;
			lineItems.push({ label: `${item.label} × ${qty}`, amount });
			total += amount;
		}
	}

	// Laundry add-on only applies to Deep Cleaning.
	if (type === "deep" && deepLaundry) {
		const qty = Math.min(Math.max(Math.floor(Number(deepLaundry.qty) || 0), 0), 10);
		if (qty > 0) {
			const requested = Number(deepLaundry.unitsMultiplier);
			const multiplier = LAUNDRY_MULTIPLIERS.includes(requested) ? requested : 1;
			const amount = qty * deepCleanLaundryAddOn.pricePerUnit * multiplier;
			lineItems.push({ label: `${deepCleanLaundryAddOn.label} × ${qty}`, amount });
			total += amount;
		}
	}

	return {
		total: round2(total),
		lineItems: lineItems.map((line) => ({ ...line, amount: round2(line.amount) })),
		sqft: clampedSqft,
		frequency: safeFrequency,
		type,
	};
}
