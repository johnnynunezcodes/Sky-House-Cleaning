// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
	// The site stays fully static except for the booking checkout API route
	// (src/pages/api/create-checkout-session.js), which opts into on-demand
	// rendering itself via `export const prerender = false`. This adapter is
	// what makes that opt-out possible on Vercel.
	adapter: vercel(),
});
