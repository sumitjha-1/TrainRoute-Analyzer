import { MINUTES_PER_DAY, absoluteToClock, formatClock } from '../time/time';

export const SEP = '\u0000';
export const errorMarkKey = (trainNumber, stationCode, kind) =>
  `${trainNumber}${SEP}${stationCode}${SEP}${kind}`;

const FIELD_LABELS = { arrival: 'Arrival time', departure: 'Departure time', station: 'Station' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtAbs(abs) {
  const { hh, mm, day } = absoluteToClock(abs);
  const t = formatClock({ hh, mm });
  return day > 0 ? `${t} (Day ${day + 1})` : t;
}

/** Gives every stop a stable id so edits can be tracked across station reassignments. */
export function stampStopUids(trains) {
  return trains.map((t) =>
    t.stops.every((s) => s.uid)
      ? t
      : { ...t, stops: t.stops.map((s, i) => (s.uid ? s : { ...s, uid: `${t.trainNumber}#${i}` })) }
  );
}

/**
 * STEP 1 of Save — Arrival/Departure dependency.
 * Only when Arrival was edited and Departure was NOT: Departure = new Arrival + original gap.
 * A manually edited Departure is never overwritten. Stops with a single time are skipped.
 */
export function applyDependencyAdjustments({ trains, baselineTrains, touched }) {
  const baseStops = new Map();
  baselineTrains.forEach((t) => t.stops.forEach((s) => s.uid && baseStops.set(s.uid, s)));
  const adjusted = new Map(); // uid -> { gap }

  const out = trains.map((train) => {
    let changed = false;
    const stops = train.stops.map((stop) => {
      const t = touched[stop.uid];
      if (!t || !t.arrival || t.departure) return stop;
      const base = baseStops.get(stop.uid);
      if (!base || base.arrivalAbs == null || base.departureAbs == null) return stop;
      if (stop.arrivalAbs == null || stop.departureAbs == null) return stop;
      const gap = base.departureAbs - base.arrivalAbs;
      if (gap < 0) return stop;

      adjusted.set(stop.uid, { gap });
      const depAbs = stop.arrivalAbs + gap;
      if (depAbs === stop.departureAbs) return stop;

      const c = absoluteToClock(depAbs);
      const clock = { hh: c.hh, mm: c.mm };
      changed = true;
      return {
        ...stop,
        departureAbs: depAbs,
        departureDay: c.day,
        departureClock: clock,
        departureRaw: formatClock(clock),
      };
    });
    return changed ? { ...train, stops } : train;
  });

  return { trains: out, adjusted };
}

/**
 * STEP 2 of Save — validation, run on absolute minutes (day*1440 + time).
 * Only trains with edits are checked, and a chronology violation is only reported when
 * one of the two events involved was actually changed, so pre-existing data problems
 * never block a save.
 */
export function validateEditedTrains({ trains, touched, adjusted, stations }) {
  const issues = [];
  const routeCodes = new Set(stations.map((s) => s.stationCode));

  const isChanged = (ev) => {
    const t = touched[ev.stop.uid];
    if (!t) return false;
    return ev.kind === 'arrival' ? !!t.arrival : !!t.departure || adjusted.has(ev.stop.uid);
  };

  for (const train of trains) {
    if (!train.stops.some((s) => touched[s.uid])) continue;

    // --- station checks (only for stops whose station was changed) ---
    const counts = new Map();
    train.stops.forEach((s) => counts.set(s.stationCode, (counts.get(s.stationCode) || 0) + 1));
    train.stops.forEach((stop) => {
      if (!touched[stop.uid]?.station) return;
      const at = stop.arrivalAbs ?? stop.departureAbs ?? 0;
      const base = {
        trainNumber: train.trainNumber,
        trainName: train.trainName || '',
        stationCode: stop.stationCode,
        field: 'station',
        fieldLabel: FIELD_LABELS.station,
        marks: [
          { stationCode: stop.stationCode, kind: 'arrival' },
          { stationCode: stop.stationCode, kind: 'departure' },
        ],
        day: Math.floor(at / MINUTES_PER_DAY),
        minutes: at % MINUTES_PER_DAY,
      };
      if (!routeCodes.has(stop.stationCode)) {
        issues.push({ ...base, reason: 'STATION_NOT_ON_ROUTE', message: `${stop.stationCode} is not on the route file, so a stop cannot be placed there.` });
      } else if (counts.get(stop.stationCode) > 1) {
        issues.push({ ...base, reason: 'DUPLICATE_STATION', message: `Station ${stop.stationCode} appears more than once in this train's schedule.` });
      }
    });

    // --- chronology: time may never move backward along the train's events ---
    const events = [];
    train.stops.forEach((stop) => {
      if (stop.arrivalAbs != null) events.push({ abs: stop.arrivalAbs, kind: 'arrival', stop });
      if (stop.departureAbs != null) events.push({ abs: stop.departureAbs, kind: 'departure', stop });
    });

    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const cur = events[i];
      if (cur.abs >= prev.abs) continue;
      if (!isChanged(cur) && !isChanged(prev)) continue;

      const blame = isChanged(cur) ? cur : prev;
      const sameStop = prev.stop.uid === cur.stop.uid;
      let message = sameStop
        ? `Departure (${fmtAbs(cur.abs)}) is earlier than arrival (${fmtAbs(prev.abs)}) at this station.`
        : `${cap(cur.kind)} at ${cur.stop.stationCode} (${fmtAbs(cur.abs)}) is earlier than ${prev.kind} at ${prev.stop.stationCode} (${fmtAbs(prev.abs)}). A train cannot be at two stations at the same time — times must move forward along the route.`;

      if (blame.kind === 'departure' && adjusted.has(blame.stop.uid)) {
        message += ` This departure was moved automatically to keep the original ${adjusted.get(blame.stop.uid).gap}-minute stoppage after the arrival change; enter a departure manually to override it.`;
      }

      issues.push({
        trainNumber: train.trainNumber,
        trainName: train.trainName || '',
        stationCode: blame.stop.stationCode,
        field: blame.kind,
        fieldLabel: FIELD_LABELS[blame.kind],
        reason: sameStop ? 'DEPARTURE_BEFORE_ARRIVAL' : 'OUT_OF_ORDER',
        message,
        marks: [
          { stationCode: cur.stop.stationCode, kind: cur.kind },
          { stationCode: prev.stop.stationCode, kind: prev.kind },
        ],
        day: Math.floor(blame.abs / MINUTES_PER_DAY),
        minutes: blame.abs % MINUTES_PER_DAY,
      });
    }
  }
  return issues;
}

export function keysFromIssues(issues) {
  const keys = new Set();
  issues.forEach((issue) =>
    issue.marks.forEach((m) => keys.add(errorMarkKey(issue.trainNumber, m.stationCode, m.kind)))
  );
  return keys;
}

/** Recomputes derived fields on edited trains once validation has passed. */
export function finalizeEditedTrains(trains, touched) {
  return trains.map((train) => {
    if (!train.stops.some((s) => touched[s.uid])) return train;
    let maxDay = 0;
    const stops = train.stops.map((s) => {
      if (s.arrivalAbs != null) maxDay = Math.max(maxDay, Math.floor(s.arrivalAbs / MINUTES_PER_DAY));
      if (s.departureAbs != null) maxDay = Math.max(maxDay, Math.floor(s.departureAbs / MINUTES_PER_DAY));
      return {
        ...s,
        isHaltInvalid: s.arrivalAbs != null && s.departureAbs != null && s.departureAbs < s.arrivalAbs,
      };
    });
    return { ...train, stops, maxDay };
  });
}