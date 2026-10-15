import { MINUTES_PER_DAY } from '../time/time.js';

/**
 * A "point" is a plotted vertex: { minutesOfDay, day, distance, stationCode, kind, clock, stopRef }
 * kind: 'arrival' | 'departure'
 * stopRef: the original ScheduleStop object this point was derived from — carried
 * through so the graph's drag-to-edit interaction can identify exactly which
 * stop/field to mutate without re-deriving it from coordinates.
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
  points.sort((a, b) => a.abs - b.abs);

  // Build a flat polyline in absolute-minute space, then slice it per day.
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

  const maxDay = points.length ? Math.floor(points[points.length - 1].abs / MINUTES_PER_DAY) : 0;
  return { segmentsByDay, maxDay, points };
}