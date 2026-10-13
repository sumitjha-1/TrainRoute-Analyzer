/**
 * Time utilities for the railway time-distance graph.
 *
 * CORE PRINCIPLE: time never moves backward.
 * Every schedule entry is stored as { hh, mm, day }, where `day` is an
 * integer offset (0, 1, 2, ...) counted from the train's origin day.
 * All comparisons/positions use "absolute minutes" = day * 1440 + hh*60 + mm,
 * which is monotonically increasing for a correctly-sequenced train.
 */

export const MINUTES_PER_DAY = 1440;

/** Parse "HH:MM" or "HH:MM:SS" into { hh, mm } (24h clock, allows 24:00 as end-of-day marker). */
export function parseClock(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  if (hh < 0 || hh > 24 || mm < 0 || mm > 59) return null;
  if (hh === 24 && mm !== 0) return null;
  return { hh, mm };
}

export function isValidClock(str) {
  return parseClock(str) !== null;
}

/** Minutes-of-day for a clock value, 0..1440 */
export function clockToMinutes({ hh, mm }) {
  return hh * 60 + mm;
}

/** Build a { hh, mm } clock object from a 0..1440 minutes-of-day value. */
export function minutesToClock(minutesOfDay) {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutesOfDay)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return { hh, mm };
}

/** Absolute minutes since the train's day-0 midnight. */
export function toAbsoluteMinutes({ hh, mm, day = 0 }) {
  return day * MINUTES_PER_DAY + clockToMinutes({ hh, mm });
}

export function absoluteToClock(absMinutes) {
  const day = Math.floor(absMinutes / MINUTES_PER_DAY);
  const rem = absMinutes - day * MINUTES_PER_DAY;
  const hh = Math.floor(rem / 60);
  const mm = Math.round(rem % 60);
  return { hh, mm, day };
}

export function formatClock({ hh, mm }) {
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Given a sequence of raw clock strings (arrival/departure pairs in file order),
 * assign monotonically increasing day offsets. Whenever a new time is earlier
 * in the day than the previous one (by more than a small tolerance), the day
 * index increments. This is how we detect a midnight crossing from a flat
 * schedule file that only has HH:MM values with no explicit day column.
 *
 * Returns the same list of items with `day` populated and `absMinutes` added.
 * `items` = [{ raw: "06:05", ...rest }, ...]
 */
export function assignDayOffsets(items, getRaw = (i) => i.raw, getExplicitDay = () => null) {
  let day = 0;
  let prevMinutes = -1;
  const out = [];
  for (const item of items) {
    const explicitDay = getExplicitDay(item);
    const clock = parseClock(getRaw(item));
    if (!clock) {
      out.push({ ...item, day: null, absMinutes: null, clock: null });
      continue;
    }
    const minutesOfDay = clockToMinutes(clock);
    if (explicitDay != null) {
      day = explicitDay;
    } else if (prevMinutes !== -1 && minutesOfDay < prevMinutes) {
      // Time appears to have gone backward -> we crossed midnight.
      day += 1;
    }
    prevMinutes = minutesOfDay;
    out.push({
      ...item,
      day,
      clock,
      absMinutes: toAbsoluteMinutes({ ...clock, day }),
    });
  }
  return out;
}

/** Difference in minutes between two absolute-minute values, always >= 0 for a valid forward schedule. */
export function minutesBetween(aAbs, bAbs) {
  return bAbs - aAbs;
}

export function clampDay(day, maxDay) {
  return Math.max(0, Math.min(day, maxDay));
}

/**
 * Re-derive day offsets + absolute minutes for an entire train's stop list,
 * in station order, from the current arrival/departure clock values alone.
 *
 * This is used after any graph-driven edit (drag) to a single stop's time:
 * rather than only patching the one field that changed, we re-run the same
 * "time never moves backward, else bump the day" logic used at initial
 * parse time (see scheduleParser.buildTrain) across the WHOLE train. That
 * guarantees a midnight-crossing edit correctly reflows every subsequent
 * stop's day, and that the point renders in the correct day-row.
 */
export function recomputeStopDays(stops) {
  const flat = [];
  stops.forEach((stop, idx) => {
    if (stop.arrivalClock) flat.push({ kind: 'arr', idx, raw: formatClock(stop.arrivalClock) });
    if (stop.departureClock) flat.push({ kind: 'dep', idx, raw: formatClock(stop.departureClock) });
  });

  const withDays = assignDayOffsets(flat, (i) => i.raw);
  const arrByIdx = new Map();
  const depByIdx = new Map();
  withDays.forEach((item) => {
    if (item.kind === 'arr') arrByIdx.set(item.idx, item);
    else depByIdx.set(item.idx, item);
  });

  return stops.map((stop, idx) => {
    const arr = arrByIdx.get(idx) || null;
    const dep = depByIdx.get(idx) || null;
    const arrivalDay = arr ? arr.day : stop.arrivalDay;
    const departureDay = dep ? dep.day : stop.departureDay;
    const arrivalAbs = arr ? arr.absMinutes : stop.arrivalAbs;
    const departureAbs = dep ? dep.absMinutes : stop.departureAbs;
    return {
      ...stop,
      arrivalDay,
      departureDay,
      arrivalAbs,
      departureAbs,
      isHaltInvalid: !!(arrivalAbs != null && departureAbs != null && departureAbs < arrivalAbs),
    };
  });
}

/**
 * Weekly-view support. The data model has no calendar dates — only a train's
 * own day offset (0, 1, 2, ...) from its origin — so "weekly" is defined as
 * offset modulo 7, Monday-based (day offset 0 = Monday). If real calendar
 * dates are ever added to the schedule data, this is the one place to change.
 */
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function dayIndexToWeekdayIndex(dayIndex) {
  return ((dayIndex % 7) + 7) % 7;
}

export function dayIndexToWeekdayName(dayIndex) {
  return WEEKDAY_NAMES[dayIndexToWeekdayIndex(dayIndex)];
}

/**
 * Real calendar date for a given day offset, given an anchor 'YYYY-MM-DD' start date.
 */
export function dayIndexToCalendarDate(startDateStr, dayIndex) {
  if (!startDateStr) return null;
  const [y, m, d] = startDateStr.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + dayIndex);
  return base;
}

const SHORT_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** e.g. "Mon 24 Aug" */
export function formatCalendarDayLabel(date) {
  if (!date) return null;
  return `${SHORT_WEEKDAY[date.getDay()]} ${date.getDate()} ${SHORT_MONTH[date.getMonth()]}`;
}