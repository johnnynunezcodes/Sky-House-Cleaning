// Google Calendar integration for the booking flow. Uses a service account
// (not OAuth) so the site can read availability and create events with no
// human login step — see AGENTS.md for the one-time setup (Google Cloud
// project, service account, sharing the calendar with it).
import { google } from "googleapis";
import { WORKING_DAYS, WORKING_HOURS, SLOT_INTERVAL_MINUTES, durationForType } from "../data/booking.js";

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

function getAuth() {
	const email = import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
	const rawKey = import.meta.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
	if (!email || !rawKey) return null;

	// Private keys are multi-line PEM strings; env vars can't hold real
	// newlines cleanly, so we store it with literal "\n" and unescape here.
	const privateKey = rawKey.replace(/\\n/g, "\n");

	return new google.auth.JWT({
		email,
		key: privateKey,
		scopes: ["https://www.googleapis.com/auth/calendar"],
	});
}

function getCalendarId() {
	return import.meta.env.GOOGLE_CALENDAR_ID || "primary";
}

export function isConfigured() {
	return Boolean(
		import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && import.meta.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
	);
}

/**
 * Returns open time slots on `dateStr` (YYYY-MM-DD) long enough for the given
 * cleaning `type`'s job duration, within business hours, with anything
 * already on the calendar blocked out.
 * @returns {Promise<{start: string, end: string}[]>}
 */
export async function getAvailableSlots({ dateStr, type, timeZone = DEFAULT_TIME_ZONE }) {
	const auth = getAuth();
	if (!auth) throw new Error("Google Calendar isn't configured yet.");

	const dayStart = new Date(`${dateStr}T00:00:00`);
	if (Number.isNaN(dayStart.getTime())) throw new Error("Invalid date.");
	if (!WORKING_DAYS.includes(dayStart.getDay())) return [];

	const windowStart = new Date(dayStart);
	windowStart.setHours(WORKING_HOURS.start, 0, 0, 0);
	const windowEnd = new Date(dayStart);
	windowEnd.setHours(WORKING_HOURS.end, 0, 0, 0);

	const now = new Date();
	if (windowEnd <= now) return [];

	const calendar = google.calendar({ version: "v3", auth });
	const calendarId = getCalendarId();

	const freebusy = await calendar.freebusy.query({
		requestBody: {
			timeMin: windowStart.toISOString(),
			timeMax: windowEnd.toISOString(),
			timeZone,
			items: [{ id: calendarId }],
		},
	});

	const busy = (freebusy.data.calendars?.[calendarId]?.busy || []).map((b) => ({
		start: new Date(b.start),
		end: new Date(b.end),
	}));

	const durationMs = durationForType(type) * 60 * 1000;
	const stepMs = SLOT_INTERVAL_MINUTES * 60 * 1000;
	const slots = [];

	for (let t = windowStart.getTime(); t + durationMs <= windowEnd.getTime(); t += stepMs) {
		const slotStart = new Date(t);
		const slotEnd = new Date(t + durationMs);
		if (slotStart < now) continue;

		const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
		if (!overlaps) {
			slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
		}
	}

	return slots;
}

/**
 * Re-checks a specific slot is still free right before charging the
 * customer, closing the small race window between two people picking the
 * same time within moments of each other.
 */
export async function isSlotStillFree({ start, end }) {
	const auth = getAuth();
	if (!auth) throw new Error("Google Calendar isn't configured yet.");

	const calendar = google.calendar({ version: "v3", auth });
	const calendarId = getCalendarId();

	const freebusy = await calendar.freebusy.query({
		requestBody: { timeMin: start, timeMax: end, items: [{ id: calendarId }] },
	});

	const busy = freebusy.data.calendars?.[calendarId]?.busy || [];
	return busy.length === 0;
}

/**
 * Creates the real calendar event once payment succeeds — the single source
 * of truth your cleaners see, with every detail from the on-site booking
 * form baked into the description.
 *
 * Inviting the customer as an attendee requires the service account to have
 * Domain-Wide Delegation set up in your Workspace admin console (a plain
 * service account isn't allowed to send calendar invites on its own). If
 * that's not set up, this falls back to creating the event without an
 * attendee rather than failing the whole booking.
 */
export async function createBookingEvent({
	start,
	end,
	summary,
	description,
	attendeeEmail,
	timeZone = DEFAULT_TIME_ZONE,
}) {
	const auth = getAuth();
	if (!auth) throw new Error("Google Calendar isn't configured yet.");

	const calendar = google.calendar({ version: "v3", auth });
	const calendarId = getCalendarId();

	const baseEvent = {
		summary,
		description,
		start: { dateTime: start, timeZone },
		end: { dateTime: end, timeZone },
	};

	if (attendeeEmail) {
		try {
			const event = await calendar.events.insert({
				calendarId,
				sendUpdates: "all",
				requestBody: { ...baseEvent, attendees: [{ email: attendeeEmail }] },
			});
			return event.data;
		} catch (err) {
			// Most likely cause: no Domain-Wide Delegation configured for this
			// service account, so it can't invite attendees. Fall back to
			// creating the event without one rather than losing the booking.
			console.warn("Couldn't add attendee to calendar event, creating without one:", err?.message);
		}
	}

	const event = await calendar.events.insert({ calendarId, requestBody: baseEvent });
	return event.data;
}
