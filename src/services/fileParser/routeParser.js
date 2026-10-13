import { readRawTable } from './rawTableReader';

const STATION_HEADERS = ['station', 'stationcode', 'station code', 'code'];
const NAME_HEADERS = ['stationname', 'station name', 'name'];
const DISTANCE_HEADERS = ['distance', 'distance(km)', 'distancekm', 'km', 'cumulativedistance'];

/**
 * @returns {{ stations: import('../../types').RouteStation[], issues: import('../../types').ValidationIssue[] }}
 */
export async function parseRouteFile(file) {
  const rows = await readRawTable(file);
  const issues = [];
  if (rows.length === 0) {
    issues.push({ level: 'error', message: 'Route file is empty.', source: 'route' });
    return { stations: [], issues };
  }

  const { headerRowIndex, colMap } = detectHeader(rows);
  const dataRows = rows.slice(headerRowIndex + 1);

  const stations = [];
  const seenCodes = new Set();

  dataRows.forEach((row, idx) => {
    const rowNumber = headerRowIndex + idx + 2; // 1-based, +1 for header row itself
    const stationCode = colMap.station != null ? row[colMap.station] : row[0];
    const distanceRaw = colMap.distance != null ? row[colMap.distance] : row[row.length - 1];
    const stationName = colMap.name != null ? row[colMap.name] : stationCode;

    if (!stationCode) {
      issues.push({ level: 'error', message: `Row ${rowNumber}: missing station code.`, source: 'route', rowNumber });
      return;
    }
    const distance = parseDistance(distanceRaw);
    if (distance == null) {
      issues.push({
        level: 'error',
        message: `Row ${rowNumber}: invalid distance value "${distanceRaw}" for station ${stationCode}.`,
        source: 'route',
        rowNumber,
        stationCode,
      });
      return;
    }
    const code = stationCode.toUpperCase();
    if (seenCodes.has(code)) {
      issues.push({
        level: 'error',
        message: `Duplicate station "${code}" in route file (row ${rowNumber}).`,
        source: 'route',
        rowNumber,
        stationCode: code,
      });
      return;
    }
    seenCodes.add(code);
    stations.push({
      stationCode: code,
      stationName: stationName || code,
      distance,
      order: stations.length,
    });
  });

  // Distances must be non-decreasing along the route.
  for (let i = 1; i < stations.length; i++) {
    if (stations[i].distance < stations[i - 1].distance) {
      issues.push({
        level: 'warning',
        message: `Distance decreases from ${stations[i - 1].stationCode} (${stations[i - 1].distance}km) to ${stations[i].stationCode} (${stations[i].distance}km). Route order may be wrong.`,
        source: 'route',
        stationCode: stations[i].stationCode,
      });
    }
  }

  if (stations.length === 0) {
    issues.push({ level: 'error', message: 'No valid stations could be parsed from the route file.', source: 'route' });
  }

  return { stations, issues };
}

function parseDistance(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/km/i, '').trim();
  const n = parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function detectHeader(rows) {
  const colMap = { station: null, name: null, distance: null };
  for (let r = 0; r < Math.min(rows.length, 3); r++) {
    const row = rows[r].map((c) => c.toLowerCase().replace(/\s+/g, ' ').trim());
    let hits = 0;
    row.forEach((cell, c) => {
      if (STATION_HEADERS.includes(cell) && colMap.station == null) { colMap.station = c; hits++; }
      if (NAME_HEADERS.includes(cell) && colMap.name == null) { colMap.name = c; hits++; }
      if (DISTANCE_HEADERS.some((h) => cell.replace(/\s+/g, '') === h.replace(/\s+/g, '')) && colMap.distance == null) {
        colMap.distance = c; hits++;
      }
    });
    if (hits > 0) {
      return { headerRowIndex: r, colMap };
    }
  }
  // No recognizable header -> assume col 0 = station, last numeric-looking col = distance, no header row consumed.
  return { headerRowIndex: -1, colMap };
}
