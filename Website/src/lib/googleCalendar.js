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

	// Google Calendar's sharing UI only lets you grant "Make changes to
	// events" to accounts inside your own Workspace domain — a service
	// account is always treated as external, so it gets capped at read
	// access no matter what's picked in the sharing dialog. Domain-Wide
	// Delegation works around this: instead of relying on a calendar-level
	// share, the service account impersonates a real Workspace mailbox
	// (GOOGLE_IMPERSONATE_EMAIL) that already owns/can edit the calendar,
	// and inherits its access. See AGENTS.md for the one-time setup.
	const impersonate = import.meta.env.GOOGLE_IMPERSONATE_EMAIL;

	return new google.auth.JWT({
		email,
		key: privateKey,
		scopes: ["https://www.googleapis.com/auth/calendar"],
		subject: impersonate || undefined,
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

// How far the given time zone's clock is from UTC, in minutes, at a specific
// instant (varies with daylight saving). Used below instead of the server's
// own local time zone, since `Date#setHours` etc. always operate in whatever
// time zone the server process happens to be running in — locally that's
// Pacific time, but on Vercel it's UTC, which silently shifted "8am" business
// hours to 8am UTC (1am Pacific) once deployed.
function getUtcOffsetMinutes(date, timeZone) {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(
		date,
	);
	const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
	const match = offsetPart.match(/GMT([+-]\d+)(?::(\d+))?/);
	if (!match) return 0;
	const hours = Number(match[1]);
	const minutes = match[2] ? Number(match[2]) : 0;
	return hours * 60 + (hours < 0 ? -minutes : minutes);
}

// Converts a wall-clock time (e.g. "8:00 AM") on `dateStr` in `timeZone` into
// the correct absolute UTC instant, regardless of what time zone the server
// process itself is running in.
function zonedTimeToUtc(dateStr, hour, minute, timeZone) {
	const [year, month, day] = dateStr.split("-").map(Number);
	const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
	const offsetMinutes = getUtcOffsetMinutes(new Date(naiveUtc), timeZone);
	return new Date(naiveUtc - offsetMinutes * 60 * 1000);
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

	const [year, month, day] = dateStr.split("-").map(Number);
	if (!year || !month || !day) throw new Error("Invalid date.");

	// Noon UTC avoids any date-rollover ambiguity when just figuring out
	// which day of the week `dateStr` falls on.
	const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
	if (!WORKING_DAYS.includes(dayOfWeek)) return [];

	const windowStart = zonedTimeToUtc(dateStr, WORKING_HOURS.start, 0, timeZone);
	const windowEnd = zonedTimeToUtc(dateStr, WORKING_HOURS.end, 0, timeZone);

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
	location,
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
		// Setting the dedicated `location` field (rather than only mentioning
		// the address in the description) is what makes it show up as a
		// tappable link in Google Calendar / Apple Calendar — tapping it opens
		// Maps directly with the address pre-filled.
		location,
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
