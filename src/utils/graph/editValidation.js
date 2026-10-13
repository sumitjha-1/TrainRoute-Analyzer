import { parseClock, recomputeStopDays } from '../time/time';

/**
 * Centralized validation for graph-driven stop edits (arrival/departure time
 * edits and station-reassignment edits). Pulling this out of useAppStore
 * means the store — and any UI that wants live feedback during a drag,
 * without committing anything — share one source of truth instead of two
 * copies of the same rules drifting apart.
 *
 * Every function here is pure: it never mutates the train/stop objects it's
 * given and never touches the store.
 */

/**
 * @param {import('../../types').Train} train
 * @param {string} stationCode
 * @param {'arrivalRaw'|'departureRaw'} field
 * @param {string} rawValue
 * @returns {{valid:boolean, reason?:string, message?:string, recomputedStops?:Array}}
 */
export function validateStopTimeEdit(train, stationCode, field, rawValue) {
  const clock = parseClock(rawValue);
  if (!clock) {
    return { valid: false, reason: 'INVALID_FORMAT', message: 'Invalid time format. Use HH:MM.' };
  }

  const stop = train.stops.find((s) => s.stationCode === stationCode);
  if (!stop) {
    return { valid: false, reason: 'STATION_NOT_FOUND', message: 'Station not found in this train.' };
  }

  const clockKey = field === 'arrivalRaw' ? 'arrivalClock' : 'departureClock';
  const rawKey = field === 'arrivalRaw' ? 'arrivalRaw' : 'departureRaw';

  const candidateStops = train.stops.map((s) => {
    if (s.stationCode !== stationCode) return s;
    return { ...s, [rawKey]: rawValue, [clockKey]: clock };
  });

  // Re-run the same "time never moves backward, else bump the day" pass used
  // at parse time, across the whole train. Day/midnight rollover is computed
  // in exactly one place (recomputeStopDays) and reused here — never a second
  // independent day-calculation system.
  const recomputedStops = recomputeStopDays(candidateStops);
  const editedStop = recomputedStops.find((s) => s.stationCode === stationCode);

  // Equal arrival/departure (zero-duration halt / pass-through) is valid —
  // only a NEGATIVE duration at the same station is rejected. Do not
  // unconditionally reject equal times; existing schedule data may
  // legitimately contain them.
  if (editedStop.arrivalAbs != null && editedStop.departureAbs != null && editedStop.departureAbs < editedStop.arrivalAbs) {
    return {
      valid: false,
      reason: 'DEPARTURE_BEFORE_ARRIVAL',
      message: 'Departure cannot be earlier than arrival at the same station.',
    };
  }

  // Chronological order across the whole train, compared in absolute minutes
  // (day*1440 + hh*60+mm) — never as bare HH:MM strings — so a 23:50 -> 00:20
  // crossing (a +30 minute forward move once day offsets apply) is correctly
  // treated as valid, not as "time went backward".
  for (let i = 0; i < recomputedStops.length; i++) {
    const cur = recomputedStops[i];
    const prev = recomputedStops[i - 1];
    if (!prev) continue;
    if (cur.arrivalAbs != null && prev.departureAbs != null && cur.arrivalAbs < prev.departureAbs) {
      return {
        valid: false,
        reason: 'OUT_OF_ORDER',
        message: `Time at ${cur.stationCode} is earlier than previous station ${prev.stationCode}.`,
      };
    }
    if (cur.departureAbs != null && prev.departureAbs != null && cur.departureAbs < prev.departureAbs) {
      return {
        valid: false,
        reason: 'OUT_OF_ORDER',
        message: `Departure at ${cur.stationCode} is earlier than previous station ${prev.stationCode}.`,
      };
    }
  }

  return { valid: true, recomputedStops };
}

/**
 * @param {import('../../types').Train} train
 * @param {import('../../types').RouteStation[]} stations
 * @param {string} oldStationCode
 * @param {string} newStationCode
 * @returns {{valid:boolean, reason?:string, message?:string, hasExisting?:boolean, isNoOp?:boolean, routeStation?:object}}
 */
export function validateStopStationEdit(train, stations, oldStationCode, newStationCode) {
  if (oldStationCode === newStationCode) {
    return { valid: true, isNoOp: true };
  }

  // Only an actual route station may be a drop target — never an arbitrary
  // code/distance. This is the route-order/route-distance source of truth.
  const routeStation = stations.find((s) => s.stationCode === newStationCode);
  if (!routeStation) {
    return {
      valid: false,
      reason: 'STATION_NOT_ON_ROUTE',
      message: `${newStationCode} is not on the route file — cannot move this stop there.`,
    };
  }

  const hasExisting = train.stops.some((s) => s.stationCode === newStationCode);
  return { valid: true, hasExisting, routeStation };
}

/**
 * Validates moving a genuine pass-through (no-halt) point, where arrival and
 * departure move TOGETHER to the same new time — so the stop never
 * accidentally gains a fake stoppage just because one half got dragged.
 */
export function validatePassThroughTimeEdit(train, stationCode, rawValue) {
  const clock = parseClock(rawValue);
  if (!clock) {
    return { valid: false, reason: 'INVALID_FORMAT', message: 'Invalid time format. Use HH:MM.' };
  }
  const stop = train.stops.find((s) => s.stationCode === stationCode);
  if (!stop) {
    return { valid: false, reason: 'STATION_NOT_FOUND', message: 'Station not found in this train.' };
  }

  const candidateStops = train.stops.map((s) => {
    if (s.stationCode !== stationCode) return s;
    return { ...s, arrivalRaw: rawValue, departureRaw: rawValue, arrivalClock: clock, departureClock: clock };
  });
  const recomputedStops = recomputeStopDays(candidateStops);

  for (let i = 0; i < recomputedStops.length; i++) {
    const cur = recomputedStops[i];
    const prev = recomputedStops[i - 1];
    if (!prev) continue;
    if (cur.arrivalAbs != null && prev.departureAbs != null && cur.arrivalAbs < prev.departureAbs) {
      return { valid: false, reason: 'OUT_OF_ORDER', message: `Time at ${cur.stationCode} is earlier than previous station ${prev.stationCode}.` };
    }
    if (cur.departureAbs != null && prev.departureAbs != null && cur.departureAbs < prev.departureAbs) {
      return { valid: false, reason: 'OUT_OF_ORDER', message: `Departure at ${cur.stationCode} is earlier than previous station ${prev.stationCode}.` };
    }
  }

  return { valid: true, recomputedStops };
}