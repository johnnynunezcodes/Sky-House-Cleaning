# Agent Instructions — Sky House Cleaning Website

Coding-specific instructions for Claude (and other agents) working in this Astro project. These override default agent behavior.

## Never run npm commands

Do not run `npm install`, `npm run dev`, `npm run build`, `npm run preview`, or any other npm/node command in this project — for any reason, including "verifying" or "testing" changes.

- Builds are handled by Vercel on deploy. There's no need to run `npm run build` to check for errors.
- The dev server (`npm run dev`) is already running locally on my machine. You don't need to start it.
- If you want to sanity-check a change, do it by reading the files (syntax, structure, matching patterns already used elsewhere in the codebase) — not by running a command.

## Never run git commands

Do not run `git add`, `git commit`, `git push`, `git status`, or any other git command in this project. I handle git myself.

## Booking & payments architecture

The site has a full booking flow, in order:

1. **Pricing page** (`src/components/PricingConfigurator.astro`) computes a quote client-side and encodes the customer's raw selections into `/book?s=<json>`.
2. **`/book` page** (`src/pages/book.astro`) shows that quote, and has its own date/time picker (Step 1 — a date strip + time-slot grid, calling `src/pages/api/availability.js` which reads real availability from Google Calendar via `src/lib/googleCalendar.js`) plus an on-site contact form (Step 2 — name, email, phone, address, access/gate code, pets, notes). No Google-hosted form is shown to the customer.
3. Submitting POSTs `{ selections, customer, slot }` to `src/pages/api/create-checkout-session.js`, which re-validates the slot is still free, recomputes the price authoritatively (see below), and creates a Stripe Checkout Session — all the customer/slot details ride along as Stripe metadata.
4. Stripe redirects the customer to pay. **Only after payment actually succeeds**, Stripe calls `src/pages/api/stripe-webhook.js`, which reads that metadata and creates the *real* Google Calendar event (via `createBookingEvent` in `src/lib/googleCalendar.js`) — title, description with every detail from the form, at the exact picked time. This is deliberately webhook-triggered rather than done immediately on "Continue to Payment," so an abandoned checkout never holds a calendar slot.

Important: the price shown in the URL/order summary is **never trusted for the actual charge**. `src/lib/pricing.js` (`calculatePrice()`) re-derives the price server-side from `src/data/content.js` on every checkout request, so the amount charged always matches the site's real pricing data, even if someone tampers with the URL.

### What I (Johnny) still need to do to make this live

**1. Run `npm install` locally.** `package.json` now includes `@astrojs/vercel`, `stripe`, and `googleapis`, but agents never run npm per the rule above — I need to install these myself.

**2. Create a Stripe account + webhook** (if not already done):
   - Get the secret key from https://dashboard.stripe.com/apikeys → `STRIPE_SECRET_KEY` in `.env` (and Vercel env vars).
   - Once deployed, go to Stripe Dashboard → Developers → Webhooks → Add endpoint → URL `https://<your-domain>/api/stripe-webhook` → listen for `checkout.session.completed` → copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
   - For local testing before it's deployed, use the Stripe CLI: `stripe listen --forward-to localhost:4321/api/stripe-webhook` (prints a temporary webhook secret to use locally).

**3. Create a Google Calendar service account** (one-time, ~15 min):
   - In [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse one), then enable the **Google Calendar API**.
   - Go to IAM & Admin → Service Accounts → Create Service Account. Give it any name (e.g. "sky-house-booking").
   - Open the new service account → Keys → Add Key → Create new key → JSON. This downloads a JSON file — open it and copy the `client_email` value into `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and the `private_key` value into `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (see `.env.example` for the exact format).
   - In Google Calendar (the calendar your cleaning jobs should land on), go to Settings → that calendar → "Share with specific people" → add the service account's email → permission **"Make changes to events."**
   - Still in that calendar's settings, under "Integrate calendar," copy the **Calendar ID** into `GOOGLE_CALENDAR_ID`.
   - Optional, skip for now: inviting the customer as a calendar attendee (so they get their own Google invite) requires Domain-Wide Delegation for the service account in your Workspace admin console. Without it, events are still created fine — they just won't auto-invite the customer. The code already falls back gracefully if this isn't set up.

**4. Double-check business hours.** `src/data/booking.js` currently assumes Mon–Sat, 8am–5pm, and rough job durations by service type (2.5hrs standard, 4hrs deep, 4.5hrs move-in/out) — adjust these to match reality once you have a feel for actual job lengths.

## Summary

Just edit the files. Don't install, build, run, or push anything.
