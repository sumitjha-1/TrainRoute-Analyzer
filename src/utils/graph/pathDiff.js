import { formatClock } from '../time/time';

const fmt = (clock, day) =>
  clock ? `${formatClock(clock)}${day > 0 ? ` +${day}d` : ''}` : '—';

const stopLabel = (s) => `${fmt(s.arrivalClock, s.arrivalDay)} → ${fmt(s.departureClock, s.departureDay)}`;

const halt = (s) =>
  s.arrivalAbs != null && s.departureAbs != null ? s.departureAbs - s.arrivalAbs : null;

/** Compact fingerprint used to detect whether a train's path really changed. */
export function trainSignature(train) {
  return train.stops.map((s) => `${s.stationCode}|${s.arrivalAbs}|${s.departureAbs}`).join(';');
}

/** Station-by-station differences between a previous and a current version of a train. */
export function diffTrains(prevTrain, currTrain) {
  const prevMap = new Map(prevTrain.stops.map((s) => [s.stationCode, s]));
  const currMap = new Map(currTrain.stops.map((s) => [s.stationCode, s]));
  const rows = [];

  currTrain.stops.forEach((s) => {
    const p = prevMap.get(s.stationCode);
    if (!p) {
      rows.push({ type: 'added', stationCode: s.stationCode, now: stopLabel(s) });
      return;
    }
    if (p.arrivalAbs !== s.arrivalAbs || p.departureAbs !== s.departureAbs) {
      rows.push({
        type: 'changed',
        stationCode: s.stationCode,
        was: stopLabel(p),
        now: stopLabel(s),
        haltWas: halt(p),
        haltNow: halt(s),
      });
    }
  });

  prevTrain.stops.forEach((p) => {
    if (!currMap.has(p.stationCode)) {
      rows.push({ type: 'removed', stationCode: p.stationCode, was: stopLabel(p) });
    }
  });

  return rows;
}