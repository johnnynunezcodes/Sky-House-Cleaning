export const testimonials = [
	{
		quote:
			"We tried Sky House Cleaning's car detailing service and were blown away. Easy to book, arrived on time, respectful of our space, and the interior of our two vehicles looked brand new.",
		name: "Eric Bachmann",
	},
	{
		quote:
			"Johnny and his team at Sky House have been so good to work with. We've had to reschedule at the last minute more than once, and they've always been so good to accommodate us.",
		name: "LaRae DeYoung",
	},
	{
		quote:
			"Finding a high quality team with integrity is such a pleasure. Emily and Johnny spent the day cleaning and caring for our house — every room vacuumed and dusted, the bathrooms scrubbed clean, and the kitchen looking like new.",
		name: "Steve Moore",
	},
];

export const cleaningServices = [
	{
		slug: "one-time-cleaning",
		title: "One-Time Cleaning",
		blurb: "A standard reset clean covering the kitchen, bathrooms, living areas, and the whole home.",
		startingAt: "From $150",
	},
	{
		slug: "recurring-cleaning",
		title: "Recurring Cleaning",
		blurb: "The same thorough clean on a weekly, bi-weekly, or monthly membership — at a lower rate.",
		startingAt: "From $105 / visit",
	},
	{
		slug: "deep-cleaning",
		title: "Deep Cleaning",
		blurb: "Standard Cleaning plus interior cabinets and appliances, walls, baseboards, and interior windows.",
		startingAt: "From $225",
	},
	{
		slug: "move-in-move-out-cleaning",
		title: "Move-In / Move-Out Cleaning",
		blurb: "A top-to-bottom clean for a home in transition, with full access to every room.",
		startingAt: "From $263",
	},
];

export const otherServices = [
	{
		slug: "garage-organization",
		title: "Garage Cleaning & Organization",
		blurb: "Decluttering, zone-based organizing, and a full clean for a garage you'll actually want to use.",
		startingAt: "Custom quote",
	},
	{
		slug: "car-detailing",
		title: "Interior Car Detailing",
		blurb: "One-time or monthly membership detailing that brings your vehicle's interior back to life.",
		startingAt: "From $275",
	},
];

export const addOns = [
	"Interior Windows",
	"Inside Oven",
	"Inside Refrigerator",
	"Inside Cabinets & Drawers",
	"Wet-Wipe Blinds",
	"Laundry (Wash & Fold)",
	"Dishwashing",
];

// Detailed add-on catalog for the one-time Standard Cleaning pricing configurator.
export const addOnCatalog = [
	{
		category: "General Touch-Ups",
		note: "Extra detail for commonly missed spots",
		items: [
			{ id: "inside-blinds", label: "Inside Blinds", pricePerUnit: 20, unit: "set" },
			{ id: "ceiling-fans", label: "Ceiling Fans (Up to 5)", price: 50, duration: "20 min" },
			{ id: "high-dusting", label: "High Dusting", price: 40, duration: "40 min" },
		],
	},
	{
		category: "Specialty & Laundry Services",
		note: "Optional specialty add-ons",
		items: [
			{ id: "wash-dry-laundry", label: "Wash & Dry Laundry", pricePerUnit: 25, unit: "load", hasUnitDiscount: true },
			{ id: "fold-laundry", label: "Fold Laundry", pricePerUnit: 10, unit: "load" },
			{ id: "inside-washer-dryer", label: "Inside Washer/Dryer", price: 20, duration: "15 min" },
			{
				id: "baseboard-deep-clean",
				label: "Baseboard Deep Clean (Whole Home)",
				price: 150,
				duration: "1 hr 30 min",
			},
			{ id: "jetted-tub", label: "Jetted Tub", price: 40, duration: "20 min" },
		],
	},
	{
		category: "Windows & Interior Detailing",
		note: "Glass, dusting & detailed touch-ups",
		items: [
			{ id: "interior-windows-10", label: "Interior Windows (Up to 10)", price: 75, duration: "40 min" },
			{ id: "interior-windows-20", label: "Interior Windows (11–20)", price: 140, duration: "1 hr 10 min" },
			{ id: "window-tracks", label: "Window Tracks (Up to 10)", price: 40, duration: "30 min" },
		],
	},
	{
		category: "Kitchen & Bathroom Upgrades",
		note: "Add deeper cleaning to high-use areas",
		items: [
			{
				id: "inside-oven",
				label: "Inside Oven",
				pricePerUnit: 50,
				unit: "oven",
				maxQuantity: 3,
				hasQuantityDiscount: true,
			},
			{
				id: "inside-fridge",
				label: "Inside Fridge",
				pricePerUnit: 45,
				unit: "fridge",
				maxQuantity: 3,
				hasQuantityDiscount: true,
			},
			{
				id: "inside-freezer",
				label: "Inside Freezer",
				pricePerUnit: 35,
				unit: "freezer",
				maxQuantity: 3,
				hasQuantityDiscount: true,
			},
			{
				id: "dishwasher-inside",
				label: "Dishwasher (Inside)",
				pricePerUnit: 25,
				unit: "dishwasher",
				maxQuantity: 3,
				hasQuantityDiscount: true,
			},
			{ id: "cabinet-interior", label: "Cabinet Interior Cleaning", price: 75, duration: "45 min" },
		],
	},
];

// Laundry add-on for Deep Cleaning — priced per load.
export const deepCleanLaundryAddOn = {
	id: "deep-clean-laundry",
	label: "Laundry (Wash & Dry)",
	pricePerUnit: 25,
	unit: "load",
	hasUnitDiscount: true,
};

// Discount tiers for homes with multiple washer/dryer units — more units means
// loads can run in parallel, so less hands-on time per load.
export const laundryUnitTiers = [
	{ multiplier: 1, label: "1 washer/dryer (standard)" },
	{ multiplier: 0.8, label: "2 washer/dryers (20% off)" },
	{ multiplier: 0.75, label: "3+ washer/dryers (25% off)" },
];

// Per-unit discount for add-ons where a home might have more than one of the
// same appliance (oven, fridge, freezer, dishwasher) — indexed by quantity - 1.
// The discount applies to every unit in the order once that quantity is reached.
export const applianceQuantityTiers = [1, 0.9, 0.85];

export const pricingMatrix = [
	{ sqft: "1–999", oneTime: 150, weekly: 105, biweekly: 120, monthly: 128, deep: 225, moveInOut: 263 },
	{ sqft: "1,000–1,499", oneTime: 225, weekly: 158, biweekly: 180, monthly: 191, deep: 338, moveInOut: 394 },
	{ sqft: "1,500–1,999", oneTime: 250, weekly: 175, biweekly: 200, monthly: 213, deep: 375, moveInOut: 438 },
	{ sqft: "2,000–2,499", oneTime: 300, weekly: 210, biweekly: 240, monthly: 255, deep: 450, moveInOut: 525 },
	{ sqft: "2,500–2,999", oneTime: 325, weekly: 228, biweekly: 260, monthly: 276, deep: 488, moveInOut: 569 },
	{ sqft: "3,000–3,499", oneTime: 375, weekly: 263, biweekly: 300, monthly: 319, deep: 563, moveInOut: 656 },
	{ sqft: "3,500–3,999", oneTime: 400, weekly: 280, biweekly: 320, monthly: 340, deep: 600, moveInOut: 700 },
	{ sqft: "4,000–4,499", oneTime: 450, weekly: 315, biweekly: 360, monthly: 383, deep: 675, moveInOut: 788 },
	{ sqft: "4,500–4,999", oneTime: 475, weekly: 333, biweekly: 380, monthly: 404, deep: 713, moveInOut: 831 },
	{ sqft: "5,000–5,499", oneTime: 525, weekly: 368, biweekly: 420, monthly: 446, deep: 788, moveInOut: 919 },
	{ sqft: "5,500–5,999", oneTime: 550, weekly: 385, biweekly: 440, monthly: 468, deep: 825, moveInOut: 963 },
];
