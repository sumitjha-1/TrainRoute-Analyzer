import { MINUTES_PER_DAY } from '../time/time.js';

/**
 * A "point" is a plotted vertex: { abs, day, distance, stationCode, kind, clock, stopRef }
 * kind: 'arrival' | 'departure'
 *
 * IMPORTANT: points are connected in STATION ORDER (stop 1 arrival -> stop 1 departure ->
 * stop 2 arrival -> stop 2 departure ...), never re-sorted by time. So while a point is being
 * edited, the path always stays attached to its own station neighbours; if a time ends up
 * out of order the line simply goes backwards, and Save validation reports it.
 */
export function buildTrainDaySegments(train) {
  const points = [];
  train.stops.forEach((stop) => {
    // Pass-through = arrival and departure are the same instant.
    // stoppageTime is stale after edits, so it is not consulted.
    const isPassThrough = stop.arrivalAbs != null && stop.arrivalAbs === stop.departureAbs;

    if (stop.arrivalAbs != null) {
      points.push({
        abs: stop.arrivalAbs,
        distance: stop.distance,
        stationCode: stop.stationCode,
        kind: 'arrival',
        clock: stop.arrivalClock,
        day: stop.arrivalDay,
        stopRef: stop,
        isSoleEvent: stop.departureAbs == null,
        isPassThrough,
      });
    }
    if (stop.departureAbs != null) {
      points.push({
        abs: stop.departureAbs,
        distance: stop.distance,
        stationCode: stop.stationCode,
        kind: 'departure',
        clock: stop.departureClock,
        day: stop.departureDay,
        stopRef: stop,
        isSoleEvent: stop.arrivalAbs == null,
        isPassThrough,
      });
    }
  });
  // NOTE: no sort by time here — see comment above.

  const segmentsByDay = new Map();
  const pushSeg = (day, seg) => {
    if (!segmentsByDay.has(day)) segmentsByDay.set(day, []);
    segmentsByDay.get(day).push(seg);
  };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dayA = Math.floor(a.abs / MINUTES_PER_DAY);
    const dayB = Math.floor(b.abs / MINUTES_PER_DAY);

    if (b.abs < a.abs) {
      // Time runs backwards (only possible mid-edit / invalid data): draw the link in the
      // earlier point's day so the path stays connected to the right neighbours.
      const toMin = Math.max(0, Math.min(MINUTES_PER_DAY, b.abs - dayA * MINUTES_PER_DAY));
      pushSeg(dayA, {
        from: { minutesOfDay: a.abs - dayA * MINUTES_PER_DAY, distance: a.distance, point: a },
        to: { minutesOfDay: toMin, distance: b.distance, point: b },
      });
      continue;
    }

    if (dayA === dayB) {
      pushSeg(dayA, {
        from: { minutesOfDay: a.abs - dayA * MINUTES_PER_DAY, distance: a.distance, point: a },
        to: { minutesOfDay: b.abs - dayB * MINUTES_PER_DAY, distance: b.distance, point: b },
      });
    } else {
      // Crosses one or more midnights: interpolate linearly through each day boundary.
      const totalMinutes = b.abs - a.abs;
      const totalDistance = b.distance - a.distance;
      let cursorAbs = a.abs;
      let cursorDistance = a.distance;
      let day = dayA;
      while (day < dayB) {
        const boundaryAbs = (day + 1) * MINUTES_PER_DAY;
        const frac = totalMinutes === 0 ? 0 : (boundaryAbs - a.abs) / totalMinutes;
        const boundaryDistance = a.distance + totalDistance * frac;
        pushSeg(day, {
          from: { minutesOfDay: cursorAbs - day * MINUTES_PER_DAY, distance: cursorDistance, point: day === dayA ? a : null },
          to: { minutesOfDay: MINUTES_PER_DAY, distance: boundaryDistance, point: null, isBoundary: true },
        });
        cursorAbs = boundaryAbs;
        cursorDistance = boundaryDistance;
        day += 1;
      }
      pushSeg(dayB, {
        from: { minutesOfDay: 0, distance: cursorDistance, point: null, isBoundary: true },
        to: { minutesOfDay: b.abs - dayB * MINUTES_PER_DAY, distance: b.distance, point: b },
      });
    }
  }

  const maxDay = points.length
    ? Math.max(...points.map((p) => Math.floor(p.abs / MINUTES_PER_DAY)))
    : 0;
  return { segmentsByDay, maxDay, points };
}