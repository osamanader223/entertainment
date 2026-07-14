// Cinema-style booking slot generation. Pure logic, no I/O — safe to import
// from server code (booking.ts) and from client components (booking-flow.tsx)
// alike. All timezone math goes through Intl (no date-fns-tz dependency).
//
// A "venue day" for date D runs from D <opensAt> to (D+1) <closesAt> whenever
// closesAt <= opensAt (i.e. the venue closes after midnight). This is the
// #1 bug-risk area — every helper here is explicit about which calendar day
// it's reasoning about.

export const SLOT_MINUTES = 30;

export interface VenueSlot {
  slotStart: string; // ISO instant
  label: string; // e.g. '9:00 PM' — English fallback; UI formats its own locale label from slotStart
  isAfterMidnight: boolean; // true if this slot's wall-clock date is the day AFTER venueDate
}

export type SlotUnavailableReason = 'past' | 'booked' | 'exceeds_closing';

export interface SlotAvailability extends VenueSlot {
  available: boolean;
  reason?: SlotUnavailableReason;
}

export interface BusyWindow {
  start: string; // ISO instant
  end: string; // ISO instant
}

function parseHHMM(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD for `date` as it reads on the wall clock in `timeZone`. */
function localDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Minutes since local midnight for `date` as it reads on the wall clock in `timeZone`. */
function localMinutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (hour % 24) * 60 + minute;
}

/** The UTC offset (in minutes) `timeZone` observes at the instant `date`. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', hour: '2-digit' }).formatToParts(date);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = raw.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? '0'));
}

/** The UTC instant for `dateStr` (YYYY-MM-DD) at wall-clock `timeStr` (HH:MM) in `timeZone`. */
function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const guess = new Date(`${dateStr}T${timeStr}:00.000Z`);
  const offset = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60_000);
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, handling month/year rollover. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** The [open, close) UTC instants for the venue-day starting on `venueDate`. */
export function getVenueDayWindow(
  venueDate: string,
  opensAt: string,
  closesAt: string,
  timezone: string,
): { openISO: string; closeISO: string } {
  const opensMin = parseHHMM(opensAt);
  const closesMin = parseHHMM(closesAt);
  const crossesMidnight = closesMin <= opensMin;
  const openUtc = zonedTimeToUtc(venueDate, opensAt.slice(0, 5), timezone);
  const closeDateStr = crossesMidnight ? addDaysToDateString(venueDate, 1) : venueDate;
  const closeUtc = zonedTimeToUtc(closeDateStr, closesAt.slice(0, 5), timezone);
  return { openISO: openUtc.toISOString(), closeISO: closeUtc.toISOString() };
}

/** Which venue-day (its start date, 'YYYY-MM-DD') a given instant falls under. */
export function resolveVenueDateForInstant(iso: string, opensAt: string, closesAt: string, timezone: string): string {
  const d = new Date(iso);
  const localDate = localDateString(d, timezone);
  const opensMin = parseHHMM(opensAt);
  const closesMin = parseHHMM(closesAt);
  const crossesMidnight = closesMin <= opensMin;
  const minutesOfDay = localMinutesOfDay(d, timezone);
  // e.g. it's 1:30am — that's still "yesterday's" venue-day (13:00 -> 04:00 next day).
  if (crossesMidnight && minutesOfDay < closesMin) {
    return addDaysToDateString(localDate, -1);
  }
  return localDate;
}

/** Today's venue-day, per the venue's own clock/timezone (not the caller's). */
export function getVenueDateForNow(opensAt: string, closesAt: string, timezone: string): string {
  return resolveVenueDateForInstant(new Date().toISOString(), opensAt, closesAt, timezone);
}

/** Whether `iso` lands exactly on a SLOT_MINUTES boundary (:00 or :30) in `timezone`. */
export function isValidSlotBoundary(iso: string, timezone: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) return false;
  return localMinutesOfDay(d, timezone) % SLOT_MINUTES === 0;
}

function formatSlotLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}

/**
 * Generate all slots for a venue-day, respecting opening hours that cross
 * midnight. For 13:00->04:00 this emits 13:00, 13:30, ... 23:30, 00:00(+1d),
 * ... 03:30 — 30 slots of SLOT_MINUTES, last one starting at 03:30.
 */
export function generateSlotsForVenueDay(input: {
  venueDate: string;
  opensAt: string;
  closesAt: string;
  timezone: string;
}): VenueSlot[] {
  const { venueDate, opensAt, closesAt, timezone } = input;
  const { openISO, closeISO } = getVenueDayWindow(venueDate, opensAt, closesAt, timezone);
  const openMs = new Date(openISO).getTime();
  const closeMs = new Date(closeISO).getTime();

  const slots: VenueSlot[] = [];
  for (let ms = openMs; ms < closeMs; ms += SLOT_MINUTES * 60_000) {
    const d = new Date(ms);
    slots.push({
      slotStart: d.toISOString(),
      label: formatSlotLabel(d, timezone),
      isAfterMidnight: localDateString(d, timezone) > venueDate,
    });
  }
  return slots;
}

/**
 * Which of `slots` are actually bookable for `durationMinutes`, given the
 * venue-day's closing instant and any existing busy windows on the station.
 *
 * A 2-hour booking at 9:00pm occupies [21:00, 23:00) — so it must mark
 * 21:00, 21:30, 22:00, and 22:30 all as 'booked' for anyone else, since a new
 * booking starting at any of those would overlap it.
 */
export function computeSlotAvailability(input: {
  slots: VenueSlot[];
  durationMinutes: number;
  closesAtISO: string;
  nowISO: string;
  busyWindows: BusyWindow[];
}): SlotAvailability[] {
  const closeMs = new Date(input.closesAtISO).getTime();
  const nowMs = new Date(input.nowISO).getTime();
  const busy = input.busyWindows.map((w) => ({ start: new Date(w.start).getTime(), end: new Date(w.end).getTime() }));

  return input.slots.map((slot) => {
    const startMs = new Date(slot.slotStart).getTime();
    const endMs = startMs + input.durationMinutes * 60_000;

    if (startMs <= nowMs) return { ...slot, available: false, reason: 'past' };
    if (endMs > closeMs) return { ...slot, available: false, reason: 'exceeds_closing' };
    if (busy.some((w) => startMs < w.end && endMs > w.start)) return { ...slot, available: false, reason: 'booked' };
    return { ...slot, available: true };
  });
}
