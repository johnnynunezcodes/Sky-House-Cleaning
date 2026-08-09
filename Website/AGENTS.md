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

### Recurring billing (subscriptions)

Weekly / bi-weekly / monthly **standard** cleanings are real Stripe subscriptions, not one-time charges — the card is saved and future visits bill automatically. One-time, deep clean, and move-in/out are always single payments.

- `src/lib/pricing.js` exports `RECURRING_INTERVALS` (the Stripe billing interval + how many days/months apart each plan's visits are) and `isRecurringFrequency()`.
- `src/pages/api/create-checkout-session.js` creates the Checkout Session with `mode: "subscription"` for recurring plans, using `price_data.recurring` on each line item. The customer/slot metadata is duplicated onto `subscription_data.metadata` (including `lastVisitStart`/`lastVisitEnd`, seeded to the first picked slot) — this is what lets the webhook figure out future visit dates, since Stripe doesn't automatically carry Checkout Session metadata onto the subscription or its invoices.
- `src/pages/api/stripe-webhook.js` handles `invoice.paid`: for the first billing cycle (`billing_reason: "subscription_create"`) it does nothing, since `checkout.session.completed` already created that first calendar event. For renewals (`billing_reason: "subscription_cycle"`) it computes the next visit's date/time (same day-of-week/time as the last one, advanced by the plan's interval), creates that calendar event, and updates the subscription's `lastVisitStart`/`lastVisitEnd` so the cycle after that computes correctly too.
- `src/pages/book/success.astro` creates a Stripe Billing Portal session for subscription bookings and shows a "Manage Your Subscription" link/button, so customers can update their card, view invoices, or cancel without calling in.

**Two one-time Stripe Dashboard steps this needs** (do these in **both** test and live mode):

1. **Turn on the Customer Portal** — Settings → Billing → Customer portal → configure and save (defaults are fine to start: allow canceling, updating payment method, viewing invoices). Until this is turned on, the "Manage Your Subscription" link just won't appear (fails silently) rather than breaking the booking confirmation.
2. **Add `invoice.paid` to the registered webhook** — Developers → Webhooks → your endpoint → Edit destination → add `invoice.paid` alongside the existing `checkout.session.completed`. Without this, recurring visits after the first one won't get scheduled (the customer will still be charged correctly by Stripe either way — this only affects whether the follow-up calendar event gets created automatically).

Known limitation: monthly plans advance by calendar month, so a visit booked for the 31st can land on the 1st–3rd of the following month depending on how many days that month has. Rare in practice, but worth knowing about.

### Rescheduling recurring plans

Two different situations, handled two different ways:

- **One-time reschedule (reverts back automatically afterward)** — e.g. moving just next week's visit to a different day, then back to normal after that. Just edit that one event directly in Google Calendar (drag it, or edit the date/time). Don't touch anything in Stripe. The subscription's stored schedule (`lastVisitStart`/`lastVisitEnd` in its metadata) is what every future visit is computed from, and it's never affected by manually moving a calendar event — so the cycle after the one you moved automatically lands back on the regular day.
- **Permanent reschedule (every future visit shifts)** — e.g. moving a customer from Tuesdays to Wednesdays going forward. Use the staff tool at `/admin/reschedule` (password-protected — see below). Search by the customer's email, pick the new date/time, and save. This updates both the subscription's stored schedule *and* moves their current upcoming calendar event to match, so it takes effect immediately.

Neither of these changes when the customer is actually billed — visit date/time and billing date are tracked separately.

**Staff tools setup:** `/admin/*` and `/api/admin/*` are gated by HTTP Basic Auth (`src/middleware.js`), using the `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars — pick your own values (not tied to any Google/Stripe account) and set them in `.env` locally and in Vercel's Production environment variables. Until both are set, those routes return a 503 instead of prompting for a login.

### Canceling recurring plans

`/admin/reschedule` also has four cancel actions per customer, each calling its own API route:

- **Cancel Next Visit — Still Charge** (`/api/admin/cancel-visit.js`) — removes just the upcoming calendar event. Billing and every visit after that continue completely normally — since billing is anchored to the actual cleaning date (see below), the customer is still charged on that original date even though nothing happens on the calendar. Nothing about the subscription's stored schedule changes. Use this for a late cancellation where the plan's cancellation policy still applies (e.g. short-notice vacation).
- **Cancel Next Visit — Skip Charge** (`/api/admin/skip-visit.js`) — cancels the upcoming visit *and* the charge for it. Since billing is tied to the cleaning date, "don't charge for the skipped visit" means fast-forwarding the whole plan by one interval: the currently-scheduled calendar event is moved to the *following* visit's date (using the same interval math the renewal webhook uses), the subscription's stored `lastVisitStart`/`lastVisitEnd`/`lastEventId` are updated to match, and billing is re-anchored to that same new date via the `trial_end` mechanism (see "Billing date alignment" below) with `proration_behavior: "none"` so the skipped cycle is never invoiced. The day-of-week/time pattern is preserved automatically. Use this for an approved, no-charge skip (e.g. the customer is out of town and it's within the plan's free-reschedule terms).
- **Cancel Plan — On This Date** (`/api/admin/cancel-subscription.js`, `immediate: false`, `cancelDate`/`cancelTime`) — staff pick exactly when the plan should stop. Visits keep billing normally, right on schedule, up through that date; nothing after it. The date/time fields default to right after the currently-scheduled next visit (`afterNextVisitStart`, computed by `find-subscriptions.js` via `nextVisitWindow`), so the common case — "let the already-scheduled visit happen and bill, then stop" — is just accepting the default. Staff can pick a later date to let several more visits bill first, or an earlier one to end things sooner.
  - **Why not `cancel_at_period_end`?** This tool used to offer a simpler "after current period" button using Stripe's `cancel_at_period_end`. That was wrong for this app: because billing is anchored to each visit's actual cleaning date, the subscription's "current period" boundary *is* the next unbilled visit's charge date — so `cancel_at_period_end` canceled the plan right *before* that next charge fired, silently skipping the visit everyone assumed would still happen and get paid for (true for the very first cycle and for every cycle after that, since periods here always run from one charge date to the next). Do not reintroduce `cancel_at_period_end` for this reason — use an explicit `cancel_at` timestamp (see `cancel-subscription.js`) instead, which lets staff choose precisely how many more visits should still bill first.
  - If the chosen date lands on or before the currently-scheduled next visit, that visit will never actually be billed under the new cancellation date — so `cancel-subscription.js` automatically deletes its calendar event too (surfaced to staff as a non-error `note` in the response), rather than leaving an unpaid visit sitting on the calendar.
- **Cancel Plan — Immediately** (`/api/admin/cancel-subscription.js`, `immediate: true`) — cancels the subscription right away *and* deletes the upcoming calendar event, since that visit is being called off. If it was already paid for, issue a refund by hand in the Stripe Dashboard (Payments → find the charge → Refund) — this tool doesn't do that automatically, since not every cancellation should be refunded.

All four require finding the subscription first via the email search at the top of the page, same as rescheduling.

### Billing date alignment

Customers are charged **on the day of each actual cleaning**, not on the day they signed up:

- At checkout, `subscription_data.billing_cycle_anchor` (in `create-checkout-session.js`) is set to the first picked slot's timestamp, with `proration_behavior: "none"` — Stripe generates no invoice at all until that date, so the first real charge lands exactly on the first cleaning, and every renewal after that follows the same cadence from that anchor.
- When staff permanently reschedules a plan via `/admin/reschedule`, `reschedule-subscription.js` also re-anchors billing to the new date using the `trial_end` mechanism (the only way Stripe allows moving an *existing* subscription's billing date to an arbitrary future timestamp — setting `billing_cycle_anchor` directly only works at creation). This briefly shows the subscription as **"Trialing"** in the Stripe Dashboard until that date arrives — expected and harmless, not an error.
- `stripe-webhook.js`'s renewal handler has a belt-and-suspenders check comparing each `invoice.paid` event's billing period to the subscription's stored `lastVisitStart`, skipping calendar event creation if they match — this prevents a duplicate visit from ever being created for a charge that corresponds to a visit already on the calendar (e.g. the delayed first charge, or the charge right after a reschedule).
- **Gotcha for future changes:** because charges are anchored to visit dates, a subscription's Stripe "current period" boundary is always the next unbilled visit's charge date — never a period the customer has already paid through in the usual SaaS sense. Don't use `cancel_at_period_end` anywhere in this app (see "Canceling recurring plans" below for why) — it cancels *before* that next charge fires, not after. Use an explicit `cancel_at` timestamp instead whenever a cancellation needs to let a specific number of future visits still bill first.

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
