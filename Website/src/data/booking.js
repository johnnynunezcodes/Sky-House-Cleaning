// Booking/scheduling configuration — used by the availability API
// (src/pages/api/availability.js) to figure out which time slots to offer,
// and by the Google Calendar helper to size the actual calendar event.
// Adjust freely as the business's real hours/crew capacity become clearer.

// Days open, 0 = Sunday ... 6 = Saturday. Closed Sundays by default.
export const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

// Business hours in 24h local time — this is the window jobs can be
// scheduled within (last possible start time is derived from `end` minus the
// job duration, so a job never gets scheduled to run past close). The office
// itself stays reachable later (until 8pm) for calls/questions, but 6pm is
// the cutoff for a cleaning to actually be running.
export const WORKING_HOURS = { start: 8, end: 18 };

// How far out customers can book, and the granularity of offered start times.
export const BOOKING_WINDOW_DAYS = 60;
export const SLOT_INTERVAL_MINUTES = 30;

// Rough job duration by cleaning type, in minutes — used to block out enough
// time on the calendar and to avoid offering a start time that wouldn't leave
// enough room before closing. These are deliberately conservative estimates;
// tune them once you have a feel for how long jobs actually run.
export const JOB_DURATION_MINUTES = {
	standard: 180, // one-time / weekly / bi-weekly / monthly
	deep: 240,
	moveInOut: 270,
	carDetailing: 120, // one-time or monthly membership, per vehicle
};

export function durationForType(type) {
	return JOB_DURATION_MINUTES[type] || JOB_DURATION_MINUTES.standard;
}

// Services with no catalog price — calculatePrice() in pricing.js has no
// branch for any of these, each one's own service page says pricing is
// custom/quote-based (see AGENTS.md → "Quote-based jobs" for the full
// research trail). They never appear in the public/phone booking flow's
// pricing configurator; staff log them directly via /admin/book-quote
// instead, with a manually entered quoted total and a required deposit.
// Shared here (rather than duplicated) so the admin form, the API that
// creates the job, and the confirm-deposit page all show the same labels.
export const QUOTE_SERVICE_TYPES = {
	commercial: "Office & Commercial Cleaning",
	postConstruction: "Post-Construction Cleaning",
	garageOrganization: "Garage Cleaning & Organization",
};
