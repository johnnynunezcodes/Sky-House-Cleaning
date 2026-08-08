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

## Project Structure
- `src/pages/` — file-based routing (e.g. `index.astro` maps to `/`)
- `public/` — static assets served as-is (favicon, images, etc.)
- `astro.config.mjs` — Astro config, currently default with no integrations added

## Current State
Bare scaffold from `npm create astro`. Just a placeholder homepage (`src/pages/index.astro`) — no real content, styling, or integrations yet.

## Content & Branding
When building out pages and copy, pull from the business reference files one level up:
- [Verbal Branding](../Branding/Verbal%20Branding.md) — voice and tone guidelines, always check before writing site copy
- [Services Overview](../Services/Overview.md) — service list and descriptions
- [Pricing Matrix](../Pricing/Pricing%20Matrix.md) — pricing table
- [Images Overview](../Images/Images.md) — logos and photos

## Notes
(Add project-specific notes, decisions, and TODOs here as the site develops.)
