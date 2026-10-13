import { assignTrainStyles } from '../../utils/graph/trainStyles';

/**
 * @param {import('../../types').RouteStation[]} stations
 * @param {import('../../types').Train[]} trains
 * @returns {{ trains: import('../../types').Train[], issues: import('../../types').ValidationIssue[] }}
 */
export function normalizeAgainstRoute(stations, trains) {
  const issues = [];
  const byCode = new Map(stations.map((s) => [s.stationCode, s]));

  const resolved = trains.map((train) => {
    const stops = train.stops.map((stop) => {
      const routeStation = byCode.get(stop.stationCode);
      if (!routeStation) {
        issues.push({
          level: 'error',
          message: `Train ${train.trainNumber}: station "${stop.stationCode}" is not present in the route file.`,
          source: 'schedule',
          trainNumber: train.trainNumber,
          stationCode: stop.stationCode,
        });
        return { ...stop, distance: null };
      }
      return { ...stop, distance: routeStation.distance };
    });
    return { ...train, stops };
  });

  // Drop stops with unresolved distance (can't be plotted), but keep the train
  // if it still has 2+ plottable points.
  const plottable = resolved
    .map((train) => ({ ...train, stops: train.stops.filter((s) => s.distance != null) }))
    .filter((train) => {
      if (train.stops.length < 2) {
        issues.push({
          level: 'error',
          message: `Train ${train.trainNumber}: fewer than 2 stations could be matched to the route — cannot plot.`,
          source: 'schedule',
          trainNumber: train.trainNumber,
        });
        return false;
      }
      return true;
    });

  const styled = assignTrainStyles(plottable);
  return { trains: styled, issues };
}
