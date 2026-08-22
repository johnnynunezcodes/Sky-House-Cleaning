// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Used to generate absolute/canonical URLs (e.g. og:url) — also referenced
  // by public/sitemap.xml and public/robots.txt below, kept in sync by hand
  // since this site doesn't use the @astrojs/sitemap integration.
  site: "https://www.skyhousecleaning.com",

  // The site stays fully static except for the booking checkout API route
  // (src/pages/api/create-checkout-session.js), which opts into on-demand
  // rendering itself via `export const prerender = false`. This adapter is
  // what makes that opt-out possible on Vercel.
  adapter: vercel(),

  integrations: [react()],

  // Tailwind is scoped to the /admin staff tools only (see
  // src/styles/admin-tailwind.css, imported solely by AdminLayout.astro) —
  // the public marketing pages never import a Tailwind entry file, so this
  // plugin has nothing to process there and Preflight can't affect them.
  vite: {
    plugins: [tailwindcss()],
  },
});