# Crew Size Planning Guide — Internal Only

**Not published anywhere on the website.** This is a private reference note for Johnny — it lives in this project folder only, not in the Website codebase, so it's never built or deployed to the live site.

## Why this exists

A planning reference for how many cleaners to dispatch on a given job. It takes the total labor-hours a home represents (same base numbers as [Hourly Rate Analysis (Internal)](Hourly%20Rate%20Analysis%20%28Internal%29.md)) and shows how the elapsed on-site time shrinks as you add cleaners — 1 through 5 — so you can pick a crew size that fits the visit into a reasonable window.

## Method and a real caveat

"Total Labor-Hrs" is how long the job takes one person working alone. Splitting that across N cleaners divides the elapsed time by N — e.g., a 6-hour job with 2 people finishes in about 3 hours.

**Recurring visits also take less time than One-Time.** A home on a regular cleaning schedule doesn't build up as much grime between visits, so each recurring cleaning needs less labor time than a One-Time cleaning of the same size — and therefore reaches a given crew-size time faster, or can get by with fewer people. The more frequent the visit, the less buildup accumulates: Weekly is fastest (~20% less time than One-Time), Bi-Weekly a bit longer (~15% less), Monthly longer still (~8% less — a month is enough time for some buildup to return), and One-Time (no maintenance history at all) takes the longest. See [Hourly Rate Analysis (Internal)](Hourly%20Rate%20Analysis%20%28Internal%29.md) for the full reasoning behind these factors.

This is still an optimistic, best-case assumption about splitting work across people:

- A single bathroom or a single kitchen really only fits 1–2 people working effectively at once — beyond that, people start waiting on each other.
- Small homes hit this ceiling fast. The numbers below will show a 750 sq ft apartment "taking" 15 minutes with 5 cleaners, which isn't realistic — nobody's dispatching 5 people for a studio. Treat any time under ~45 minutes–1 hour as "this crew size is more than the job can usefully absorb," not as a real target.
- Coordination overhead (people bumping into each other, dividing rooms, driving multiple vehicles) eats into the time savings as crew size grows, especially past 3 people.

Use this as a directional guide, not an exact formula — best suited for deciding between 1, 2, or 3 cleaners on most jobs, with 4–5 only realistic on your largest homes (roughly 6,000+ sq ft) where there's enough separate square footage for that many people to work without tripping over each other.

## Standard Cleaning, by frequency

### One-Time

| Sq Ft | Total Labor-Hrs | 1 Cleaner | 2 Cleaners | 3 Cleaners | 4 Cleaners | 5 Cleaners |
|---|---|---|---|---|---|---|
| 1–999 | 1.5 hrs | 1h 30m | 0h 45m | 0h 30m | 0h 30m | 0h 15m |
| 1,000–1,499 | 2.1 hrs | 2h | 1h | 0h 45m | 0h 30m | 0h 30m |
| 1,500–1,999 | 2.9 hrs | 3h | 1h 30m | 1h | 0h 45m | 0h 30m |
| 2,000–2,499 | 3.8 hrs | 3h 45m | 2h | 1h 15m | 1h | 0h 45m |
| 2,500–2,999 | 4.6 hrs | 4h 30m | 2h 15m | 1h 30m | 1h 15m | 1h |
| 3,000–3,499 | 5.4 hrs | 5h 30m | 2h 45m | 1h 45m | 1h 15m | 1h |
| 3,500–3,999 | 6.3 hrs | 6h 15m | 3h 15m | 2h | 1h 30m | 1h 15m |
| 4,000–4,499 | 7.1 hrs | 7h | 3h 30m | 2h 15m | 1h 45m | 1h 30m |
| 4,500–4,999 | 7.9 hrs | 8h | 4h | 2h 45m | 2h | 1h 30m |
| 5,000–5,499 | 8.8 hrs | 8h 45m | 4h 30m | 3h | 2h 15m | 1h 45m |
| 5,500–5,999 | 9.6 hrs | 9h 30m | 4h 45m | 3h 15m | 2h 30m | 2h |
| 6,000–6,499 | 10.4 hrs | 10h 30m | 5h 15m | 3h 30m | 2h 30m | 2h |
| 6,500–6,999 | 11.3 hrs | 11h 15m | 5h 45m | 3h 45m | 2h 45m | 2h 15m |
| 7,000–7,499 | 12.1 hrs | 12h | 6h | 4h | 3h | 2h 30m |
| 7,500–7,999 | 12.9 hrs | 13h | 6h 30m | 4h 15m | 3h 15m | 2h 30m |
| 8,000–8,499 | 13.8 hrs | 13h 45m | 7h | 4h 30m | 3h 30m | 2h 45m |
| 8,500–8,999 | 14.6 hrs | 14h 30m | 7h 15m | 4h 45m | 3h 45m | 3h |
| 9,000–9,499 | 15.4 hrs | 15h 30m | 7h 45m | 5h 15m | 3h 45m | 3h |
| 9,500–9,999 | 16.3 hrs | 16h 15m | 8h 15m | 5h 30m | 4h | 3h 15m |

### Weekly

| Sq Ft | Total Labor-Hrs | 1 Cleaner | 2 Cleaners | 3 Cleaners | 4 Cleaners | 5 Cleaners |
|---|---|---|---|---|---|---|
| 1–999 | 1.5 hrs | 1h 30m | 0h 45m | 0h 30m | 0h 30m | 0h 15m |
| 1,000–1,499 | 1.7 hrs | 1h 45m | 0h 45m | 0h 30m | 0h 30m | 0h 15m |
| 1,500–1,999 | 2.3 hrs | 2h 15m | 1h 15m | 0h 45m | 0h 30m | 0h 30m |
| 2,000–2,499 | 3.0 hrs | 3h | 1h 30m | 1h | 0h 45m | 0h 30m |
| 2,500–2,999 | 3.7 hrs | 3h 45m | 1h 45m | 1h 15m | 1h | 0h 45m |
| 3,000–3,499 | 4.3 hrs | 4h 15m | 2h 15m | 1h 30m | 1h | 0h 45m |
| 3,500–3,999 | 5.0 hrs | 5h | 2h 30m | 1h 45m | 1h 15m | 1h |
| 4,000–4,499 | 5.7 hrs | 5h 45m | 2h 45m | 2h | 1h 30m | 1h 15m |
| 4,500–4,999 | 6.3 hrs | 6h 15m | 3h 15m | 2h | 1h 30m | 1h 15m |
| 5,000–5,499 | 7.0 hrs | 7h | 3h 30m | 2h 15m | 1h 45m | 1h 30m |
| 5,500–5,999 | 7.7 hrs | 7h 45m | 3h 45m | 2h 30m | 2h | 1h 30m |
| 6,000–6,499 | 8.3 hrs | 8h 15m | 4h 15m | 2h 45m | 2h | 1h 45m |
| 6,500–6,999 | 9.0 hrs | 9h | 4h 30m | 3h | 2h 15m | 1h 45m |
| 7,000–7,499 | 9.7 hrs | 9h 45m | 4h 45m | 3h 15m | 2h 30m | 2h |
| 7,500–7,999 | 10.3 hrs | 10h 15m | 5h 15m | 3h 30m | 2h 30m | 2h |
| 8,000–8,499 | 11.0 hrs | 11h | 5h 30m | 3h 45m | 2h 45m | 2h 15m |
| 8,500–8,999 | 11.7 hrs | 11h 45m | 5h 45m | 4h | 3h | 2h 15m |
| 9,000–9,499 | 12.3 hrs | 12h 15m | 6h 15m | 4h | 3h | 2h 30m |
| 9,500–9,999 | 13.0 hrs | 13h | 6h 30m | 4h 15m | 3h 15m | 2h 30m |

### Bi-Weekly

| Sq Ft | Total Labor-Hrs | 1 Cleaner | 2 Cleaners | 3 Cleaners | 4 Cleaners | 5 Cleaners |
|---|---|---|---|---|---|---|
| 1–999 | 1.5 hrs | 1h 30m | 0h 45m | 0h 30m | 0h 30m | 0h 15m |
| 1,000–1,499 | 1.8 hrs | 1h 45m | 1h | 0h 30m | 0h 30m | 0h 15m |
| 1,500–1,999 | 2.5 hrs | 2h 30m | 1h 15m | 0h 45m | 0h 30m | 0h 30m |
| 2,000–2,499 | 3.2 hrs | 3h 15m | 1h 30m | 1h | 0h 45m | 0h 45m |
| 2,500–2,999 | 3.9 hrs | 4h | 2h | 1h 15m | 1h | 0h 45m |
| 3,000–3,499 | 4.6 hrs | 4h 30m | 2h 15m | 1h 30m | 1h 15m | 1h |
| 3,500–3,999 | 5.3 hrs | 5h 15m | 2h 45m | 1h 45m | 1h 15m | 1h |
| 4,000–4,499 | 6.0 hrs | 6h | 3h | 2h | 1h 30m | 1h 15m |
| 4,500–4,999 | 6.7 hrs | 6h 45m | 3h 15m | 2h 15m | 1h 45m | 1h 15m |
| 5,000–5,499 | 7.4 hrs | 7h 30m | 3h 45m | 2h 30m | 1h 45m | 1h 30m |
| 5,500–5,999 | 8.1 hrs | 8h 15m | 4h | 2h 45m | 2h | 1h 45m |
| 6,000–6,499 | 8.9 hrs | 8h 45m | 4h 30m | 3h | 2h 15m | 1h 45m |
| 6,500–6,999 | 9.6 hrs | 9h 30m | 4h 45m | 3h 15m | 2h 30m | 2h |
| 7,000–7,499 | 10.3 hrs | 10h 15m | 5h 15m | 3h 30m | 2h 30m | 2h |
| 7,500–7,999 | 11.0 hrs | 11h | 5h 30m | 3h 45m | 2h 45m | 2h 15m |
| 8,000–8,499 | 11.7 hrs | 11h 45m | 5h 45m | 4h | 3h | 2h 15m |
| 8,500–8,999 | 12.4 hrs | 12h 30m | 6h 15m | 4h 15m | 3h | 2h 30m |
| 9,000–9,499 | 13.1 hrs | 13h | 6h 30m | 4h 15m | 3h 15m | 2h 30m |
| 9,500–9,999 | 13.8 hrs | 13h 45m | 7h | 4h 30m | 3h 30m | 2h 45m |

### Monthly

| Sq Ft | Total Labor-Hrs | 1 Cleaner | 2 Cleaners | 3 Cleaners | 4 Cleaners | 5 Cleaners |
|---|---|---|---|---|---|---|
| 1–999 | 1.5 hrs | 1h 30m | 0h 45m | 0h 30m | 0h 30m | 0h 15m |
| 1,000–1,499 | 1.9 hrs | 2h | 1h | 0h 45m | 0h 30m | 0h 30m |
| 1,500–1,999 | 2.7 hrs | 2h 45m | 1h 15m | 1h | 0h 45m | 0h 30m |
| 2,000–2,499 | 3.5 hrs | 3h 30m | 1h 45m | 1h 15m | 0h 45m | 0h 45m |
| 2,500–2,999 | 4.2 hrs | 4h 15m | 2h | 1h 30m | 1h | 0h 45m |
| 3,000–3,499 | 5.0 hrs | 5h | 2h 30m | 1h 45m | 1h 15m | 1h |
| 3,500–3,999 | 5.8 hrs | 5h 45m | 3h | 2h | 1h 30m | 1h 15m |
| 4,000–4,499 | 6.5 hrs | 6h 30m | 3h 15m | 2h 15m | 1h 45m | 1h 15m |
| 4,500–4,999 | 7.3 hrs | 7h 15m | 3h 45m | 2h 30m | 1h 45m | 1h 30m |
| 5,000–5,499 | 8.1 hrs | 8h | 4h | 2h 45m | 2h | 1h 30m |
| 5,500–5,999 | 8.8 hrs | 8h 45m | 4h 30m | 3h | 2h 15m | 1h 45m |
| 6,000–6,499 | 9.6 hrs | 9h 30m | 4h 45m | 3h 15m | 2h 30m | 2h |
| 6,500–6,999 | 10.3 hrs | 10h 15m | 5h 15m | 3h 30m | 2h 30m | 2h |
| 7,000–7,499 | 11.1 hrs | 11h | 5h 30m | 3h 45m | 2h 45m | 2h 15m |
| 7,500–7,999 | 11.9 hrs | 12h | 6h | 4h | 3h | 2h 30m |
| 8,000–8,499 | 12.7 hrs | 12h 45m | 6h 15m | 4h 15m | 3h 15m | 2h 30m |
| 8,500–8,999 | 13.4 hrs | 13h 30m | 6h 45m | 4h 30m | 3h 15m | 2h 45m |
| 9,000–9,499 | 14.2 hrs | 14h 15m | 7h | 4h 45m | 3h 30m | 2h 45m |
| 9,500–9,999 | 15.0 hrs | 15h | 7h 30m | 5h | 3h 45m | 3h |

## Deep Cleaning

| Sq Ft | Total Labor-Hrs | 1 Cleaner | 2 Cleaners | 3 Cleaners | 4 Cleaners | 5 Cleaners |
|---|---|---|---|---|---|---|
| 1–999 | 2.5 hrs | 2h 30m | 1h 15m | 0h 45m | 0h 45m | 0h 30m |
| 1,000–1,499 | 3.6 hrs | 3h 30m | 1h 45m | 1h 15m | 1h | 0h 45m |
| 1,500–1,999 | 5.0 hrs | 5h | 2h 30m | 1h 45m | 1h 15m | 1h |
| 2,000–2,499 | 6.4 hrs | 6h 30m | 3h 15m | 2h 15m | 1h 30m | 1h 15m |
| 2,500–2,999 | 7.9 hrs | 7h 45m | 4h | 2h 30m | 2h | 1h 30m |
| 3,000–3,499 | 9.3 hrs | 9h 15m | 4h 45m | 3h | 2h 15m | 1h 45m |
| 3,500–3,999 | 10.7 hrs | 10h 45m | 5h 15m | 3h 30m | 2h 45m | 2h 15m |
| 4,000–4,499 | 12.1 hrs | 12h 15m | 6h | 4h | 3h | 2h 30m |
| 4,500–4,999 | 13.6 hrs | 13h 30m | 6h 45m | 4h 30m | 3h 30m | 2h 45m |
| 5,000–5,499 | 15.0 hrs | 15h | 7h 30m | 5h | 3h 45m | 3h |
| 5,500–5,999 | 16.4 hrs | 16h 30m | 8h 15m | 5h 30m | 4h | 3h 15m |
| 6,000–6,499 | 17.9 hrs | 17h 45m | 9h | 6h | 4h 30m | 3h 30m |
| 6,500–6,999 | 19.3 hrs | 19h 15m | 9h 45m | 6h 30m | 4h 45m | 3h 45m |
| 7,000–7,499 | 20.7 hrs | 20h 45m | 10h 15m | 7h | 5h 15m | 4h 15m |
| 7,500–7,999 | 22.1 hrs | 22h 15m | 11h | 7h 30m | 5h 30m | 4h 30m |
| 8,000–8,499 | 23.6 hrs | 23h 30m | 11h 45m | 7h 45m | 6h | 4h 45m |
| 8,500–8,999 | 25.0 hrs | 25h | 12h 30m | 8h 15m | 6h 15m | 5h |
| 9,000–9,499 | 26.4 hrs | 26h 30m | 13h 15m | 8h 45m | 6h 30m | 5h 15m |
| 9,500–9,999 | 27.9 hrs | 27h 45m | 14h | 9h 15m | 7h | 5h 30m |

## Move-In / Move-Out Cleaning

| Sq Ft | Total Labor-Hrs | 1 Cleaner | 2 Cleaners | 3 Cleaners | 4 Cleaners | 5 Cleaners |
|---|---|---|---|---|---|---|
| 1–999 | 2.5 hrs | 2h 30m | 1h 15m | 0h 45m | 0h 45m | 0h 30m |
| 1,000–1,499 | 3.3 hrs | 3h 15m | 1h 45m | 1h | 0h 45m | 0h 45m |
| 1,500–1,999 | 4.6 hrs | 4h 30m | 2h 15m | 1h 30m | 1h 15m | 1h |
| 2,000–2,499 | 5.9 hrs | 6h | 3h | 2h | 1h 30m | 1h 15m |
| 2,500–2,999 | 7.2 hrs | 7h 15m | 3h 30m | 2h 30m | 1h 45m | 1h 30m |
| 3,000–3,499 | 8.6 hrs | 8h 30m | 4h 15m | 2h 45m | 2h 15m | 1h 45m |
| 3,500–3,999 | 9.9 hrs | 9h 45m | 5h | 3h 15m | 2h 30m | 2h |
| 4,000–4,499 | 11.2 hrs | 11h 15m | 5h 30m | 3h 45m | 2h 45m | 2h 15m |
| 4,500–4,999 | 12.5 hrs | 12h 30m | 6h 15m | 4h 15m | 3h 15m | 2h 30m |
| 5,000–5,499 | 13.8 hrs | 13h 45m | 7h | 4h 30m | 3h 30m | 2h 45m |
| 5,500–5,999 | 15.1 hrs | 15h 15m | 7h 30m | 5h | 3h 45m | 3h |
| 6,000–6,499 | 16.4 hrs | 16h 30m | 8h 15m | 5h 30m | 4h | 3h 15m |
| 6,500–6,999 | 17.8 hrs | 17h 45m | 9h | 6h | 4h 30m | 3h 30m |
| 7,000–7,499 | 19.1 hrs | 19h | 9h 30m | 6h 15m | 4h 45m | 3h 45m |
| 7,500–7,999 | 20.4 hrs | 20h 30m | 10h 15m | 6h 45m | 5h | 4h |
| 8,000–8,499 | 21.7 hrs | 21h 45m | 10h 45m | 7h 15m | 5h 30m | 4h 15m |
| 8,500–8,999 | 23.0 hrs | 23h | 11h 30m | 7h 45m | 5h 45m | 4h 30m |
| 9,000–9,499 | 24.3 hrs | 24h 15m | 12h 15m | 8h | 6h | 4h 45m |
| 9,500–9,999 | 25.7 hrs | 25h 45m | 12h 45m | 8h 30m | 6h 30m | 5h 15m |

## Reading this for a real decision

Your business hours run 8am–6pm (10-hour window, see `WORKING_HOURS` in the website's `booking.js`), and appointments need to leave room to actually finish within that window. As a rough rule from the tables above:

- **Solo cleaner:** comfortably handles One-Time cleanings up to ~3,500–4,000 sq ft (recurring visits stretch that further — a solo cleaner can handle a Weekly up to ~4,500–5,000 sq ft in the same time) and deep/move-in-out up to ~1,500–2,000 sq ft within a single business day.
- **2 cleaners:** One-Time up to ~7,000+ sq ft, deep/move-in-out up to ~4,000–4,500 sq ft.
- **3 cleaners:** most jobs across the entire size range fit inside a business day, including your largest deep cleans and move-in/outs.
- **4–5 cleaners:** mainly useful for compressing your largest homes (6,000+ sq ft) into a half-day visit, or for squeezing a same-day turnaround on a big move-out.
- **Frequency matters too:** for the same crew size and the same home, a Weekly visit finishes noticeably faster than a One-Time visit of that size — worth keeping in mind if you're staffing a mixed route of one-time and recurring jobs in a single day.

These are all estimates pending real job-timing data — revisit both this and the Hourly Rate Analysis once you have a feel for how long jobs actually take with your real crews.
