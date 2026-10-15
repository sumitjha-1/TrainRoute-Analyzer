export const BASE_PX_PER_MINUTE = 2.2;
export const BASE_PX_PER_KM = 0.6;
export const STATION_LABEL_COL_WIDTH = 70; // was 180
export const DAY_PANEL_HEADER_HEIGHT = 20; // was 40
export const DAY_PANEL_GAP = 28;
export const MIN_PANEL_HEIGHT = 260;
export const VIRTUALIZATION_BUFFER_PX = 400;

export function pxPerMinute(zoom) {
  return BASE_PX_PER_MINUTE * zoom;
}

export function panelWidth(zoom) {
  return 1440 * pxPerMinute(zoom);
}

export function minutesToX(minutesOfDay, zoom) {
  return minutesOfDay * pxPerMinute(zoom);
}

export function xToMinutes(x, zoom) {
  return x / pxPerMinute(zoom);
}

export function effectiveZoomForWidth(zoom, availableWidth) {
  if (!availableWidth || availableWidth <= 0) return zoom;
  const naturalWidth = panelWidth(zoom);
  if (naturalWidth >= availableWidth) return zoom;
  return availableWidth / (1440 * BASE_PX_PER_MINUTE);
}

/**
 * Build the vertical distance scale for station positions.
 *
 * Long distances are compressed to `maxGap`, short ones are held at `minGap`,
 * and the whole graph fills the viewport height without stretching the gaps.
 *
 * @param {import('../../types').RouteStation[]} stations
 * @param {number} zoom
 * @param {number|null} [targetHeight] — if provided and larger than the
 *   natural height, the returned height grows to fill the viewport, but the
 *   station gaps themselves are not stretched.
 * @returns {{ toY: (stationCode: string) => number|null, toYFromDistance: (distance: number) => number|null, height: number }}
 */
export function buildDistanceScale(stations, zoom, targetHeight = null) {
  if (stations.length === 0) {
    return { toY: () => 0, toYFromDistance: () => 0, height: MIN_PANEL_HEIGHT };
  }
  const pxPerKm = BASE_PX_PER_KM * zoom;
  const minGap = Math.max(22, 30 * zoom);             // zoom out/in now compresses/expands station spacing too
  const maxGap = Math.max(minGap, 56 * zoom);         // long distances are compressed to this
  const topPadding = 16;
  const bottomPadding = 28;

  const y = [topPadding];
  for (let i = 1; i < stations.length; i++) {
    const real = (stations[i].distance - stations[i - 1].distance) * pxPerKm;
    y.push(y[i - 1] + Math.min(Math.max(real, minGap), maxGap));
  }

  const naturalHeight = y[y.length - 1] + bottomPadding;
  const height = Math.max(naturalHeight, MIN_PANEL_HEIGHT, targetHeight || 0); // fill the viewport, but don't stretch gaps
  const map = new Map(stations.map((s, i) => [s.stationCode, y[i]]));
  const distPoints = stations.map((s, i) => ({ distance: s.distance, y: y[i] }));

  function toYFromDistance(distance) {
    if (distance == null || distPoints.length === 0) return null;
    if (distPoints.length === 1) return distPoints[0].y;
    if (distance <= distPoints[0].distance) return distPoints[0].y;
    const last = distPoints[distPoints.length - 1];
    if (distance >= last.distance) return last.y;
    for (let i = 1; i < distPoints.length; i++) {
      const a = distPoints[i - 1];
      const b = distPoints[i];
      if (distance <= b.distance) {
        if (b.distance === a.distance) return b.y;
        const frac = (distance - a.distance) / (b.distance - a.distance);
        return a.y + (b.y - a.y) * frac;
      }
    }
    return last.y;
  }

  return { toY: (code) => map.get(code), toYFromDistance, height };
}

export function findNearestStation(stations, scale, y) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const sy = scale.toY(s.stationCode);
    if (sy == null) continue;
    const d = Math.abs(sy - y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export function visibleMinuteRange(scrollLeft, clientWidth, zoom) {
  const ppm = pxPerMinute(zoom);
  const left = Math.max(0, scrollLeft - VIRTUALIZATION_BUFFER_PX - STATION_LABEL_COL_WIDTH);
  const right = scrollLeft + clientWidth + VIRTUALIZATION_BUFFER_PX;
  return {
    minMinutes: Math.max(0, left / ppm),
    maxMinutes: Math.min(1440, right / ppm),
  };
}

export function visibleYRange(scrollTop, clientHeight) {
  return {
    minY: Math.max(0, scrollTop - VIRTUALIZATION_BUFFER_PX),
    maxY: scrollTop + clientHeight + VIRTUALIZATION_BUFFER_PX,
  };
}

export function rangesOverlap(aMin, aMax, bMin, bMax) {
  return aMax >= bMin && aMin <= bMax;
}