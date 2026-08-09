# Sky House Cleaning — Website

Marketing website for Sky House Cleaning, built with [Astro](https://astro.build).

## Stack
- Astro 7.2.0
- Node >=22.12.0
- No UI framework or CSS framework added yet — plain Astro components for now

## Getting Started
```
npm install
npm run dev       # starts the dev server
npm run build     # builds for production to ./dist
npm run preview   # previews the production build locally
```

For the booking/payment flow to work locally, copy `.env.example` to `.env` and fill in the Stripe and Google Calendar variables (see "Booking & payments architecture" in AGENTS.md for full setup steps).

## Project Structure
- `src/pages/` — file-based routing (e.g. `index.astro` maps to `/`)
- `public/` — static assets served as-is (favicon, images, etc.)
- `astro.config.mjs` — Astro config, currently default with no integrations added

## Current State
Full site built out: Home, About, Services (overview + 6 detail pages), Pricing, Reviews, and Contact, with a shared design system (`src/styles/global.css`), Navbar/Footer, and reusable components (`ServiceCard`, `ChecklistCard`, `TestimonialCard`, `PageHero`, `CtaBand`). Content pulled from the reference files listed below. Service/pricing/testimonial data lives in `src/data/content.js`.

The Pricing page's `PricingConfigurator` now flows into a full booking pipeline: `/book` (a real date/time picker backed by Google Calendar availability, plus an on-site contact form) → `src/pages/api/create-checkout-session.js` (Stripe Checkout) → `src/pages/api/stripe-webhook.js` (creates the actual Google Calendar event once payment succeeds). See "Booking & payments architecture" in [AGENTS.md](AGENTS.md) for how it fits together and the setup steps still needed to go live (installing new deps, Stripe keys + webhook, Google service account). The rest of the site's "Call"/"Email" CTAs are unchanged for now.

## Content & Branding
When building out pages and copy, pull from the business reference files one level up:
- [Verbal Branding](../Branding/Verbal%20Branding.md) — voice and tone guidelines, always check before writing site copy
- [Services Overview](../Services/Overview.md) — service list and descriptions
- [Pricing Matrix](../Pricing/Pricing%20Matrix.md) — pricing table
- [Images Overview](../Images/Images.md) — logos and photos

## Notes
See [AGENTS.md](AGENTS.md) (aliased as `CLAUDE.md`) for agent-specific rules: no npm commands (build is handled by Vercel, dev server is already running locally) and no git commands (handled manually).
