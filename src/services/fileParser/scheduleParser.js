import { readRawTable } from './rawTableReader';
import { parseClock, assignDayOffsets } from '../../utils/time/time';

const TRAIN_LINE_RE = /^\s*train\s*[:#-]?\s*(\S+)\s*(.*)$/i;
const ARRIVAL_RE = /arr(?:ival)?[.:\s]*([0-9]{1,2}:[0-9]{2})/i;
const DEPARTURE_RE = /dep(?:arture)?[.:\s]*([0-9]{1,2}:[0-9]{2})/i;
const BARE_TIME_RE = /^([0-9]{1,2}:[0-9]{2})$/;

/**
 * @returns {{ trains: import('../../types').Train[], issues: import('../../types').ValidationIssue[] }}
 */
export async function parseScheduleFile(file) {
  const rows = await readRawTable(file);
  const issues = [];
  if (rows.length === 0) {
    issues.push({ level: 'error', message: 'Schedule file is empty.', source: 'schedule' });
    return { trains: [], issues };
  }

  // Detect the NEW merged Excel format FIRST
  if (detectNewMergedExcelFormat(rows)) {
    return parseNewMergedExcelFormat(rows, issues);
  }

  // Existing column‑based Excel format
  const isColumnBased = detectColumnBased(rows);
  if (isColumnBased) {
    return parseColumnBased(rows, issues);
  }

  // Existing text‑based parsing
  const startIdx = looksLikeHeader(rows[0]) ? 1 : 0;
  const rawTrains = [];
  let current = null;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    const rowText = row.join(' ');
    const trainMatch = rowText.match(TRAIN_LINE_RE);

    if (trainMatch) {
      current = { trainNumber: trainMatch[1].trim(), trainName: trainMatch[2].trim(), stopRows: [] };
      rawTrains.push(current);
      continue;
    }

    if (!current) {
      issues.push({
        level: 'error',
        message: `Row ${rowNumber}: schedule data found before any "Train <number>" line.`,
        source: 'schedule',
        rowNumber,
      });
      continue;
    }

    const tokens = rowText.trim().split(/\s+/);
    const stationCode = tokens[0] || '';
    if (!stationCode) continue;

    const { arrivalRaw, departureRaw } = extractTimes(rowText, tokens.slice(1));
    current.stopRows.push({ rowNumber, stationCode: stationCode.toUpperCase(), arrivalRaw, departureRaw });
  }

  const trains = rawTrains.map((rt) => buildTrain(rt, issues)).filter(Boolean);
  if (trains.length === 0) {
    issues.push({ level: 'error', message: 'No valid trains could be parsed from the schedule file.', source: 'schedule' });
  }
  return { trains, issues };
}

// ==================== NEW MERGED EXCEL FORMAT ====================

function detectNewMergedExcelFormat(rows) {
  if (rows.length === 0) return false;
  const header = rows[0].map((c) => c.toLowerCase().trim());
  return header.includes('mavtrainnumber') && header.includes('mavsttncode');
}

function parseNewMergedExcelFormat(rows, issues) {
  const header = rows[0].map((c) => c.toLowerCase().trim());
  const colIdx = {
    train: header.indexOf('mavtrainnumber'),
    seq: header.indexOf('manseqnumber'),
    station: header.indexOf('mavsttncode'),
    wttArr: header.indexOf('manwttarvl'),
    wttDep: header.indexOf('manwttdprt'),
    wttDay: header.indexOf('manwttdayofrun'),
    pttArr: header.indexOf('manpttarvl'),
    pttDep: header.indexOf('manpttdprt'),
    pttDay: header.indexOf('manpttdayofrun'),
    cumDist: header.indexOf('mancumdistance'),
    stationLine: header.indexOf('mavsttnline'),
    blockSection: header.indexOf('mavblcksctn'),
    coBlockSection: header.indexOf('mavcoablcksctn'),
    stpgTime: header.indexOf('manstpgtime'),          // stoppage time
    cstpgTime: header.indexOf('mancstpgtime'),        // continuous stoppage time
    trainId: header.indexOf('mantrainid'), // ignored
  };

  if (colIdx.train === -1 || colIdx.station === -1) {
    issues.push({ level: 'error', message: 'New merged Excel format requires MAVTRAINNUMBER and MAVSTTNCODE columns.', source: 'schedule' });
    return { trains: [], issues };
  }

  // Group rows by train number
  const trainMap = new Map();
  const trainOrder = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const trainVal = row[colIdx.train]?.trim();
    const stationVal = row[colIdx.station]?.trim();
    if (!trainVal || !stationVal) continue;

    if (!trainMap.has(trainVal)) {
      trainMap.set(trainVal, []);
      trainOrder.push(trainVal);
    }
    trainMap.get(trainVal).push({ row, rowIndex: i });
  }

  const trains = [];
  for (const trainNumber of trainOrder) {
    const trainRows = trainMap.get(trainNumber);
    // Sort by sequence number
    trainRows.sort((a, b) => {
      const seqA = parseInt(a.row[colIdx.seq] || '0', 10);
      const seqB = parseInt(b.row[colIdx.seq] || '0', 10);
      return seqA - seqB;
    });

    const stops = [];
    for (const { row, rowIndex } of trainRows) {
      const stationCode = row[colIdx.station].trim().toUpperCase();

      const wttArrRaw = row[colIdx.wttArr]?.trim() || null;
      const wttDepRaw = row[colIdx.wttDep]?.trim() || null;
      const pttArrRaw = row[colIdx.pttArr]?.trim() || null;
      const pttDepRaw = row[colIdx.pttDep]?.trim() || null;

      const arrivalRaw = convertTimeValue(wttArrRaw) || convertTimeValue(pttArrRaw);
      const departureRaw = convertTimeValue(wttDepRaw) || convertTimeValue(pttDepRaw);

      const wttDay = row[colIdx.wttDay]?.trim();
      const pttDay = row[colIdx.pttDay]?.trim();
      const dayRaw = wttDay || pttDay || null;

      if (!arrivalRaw && !departureRaw) {
        issues.push({
          level: 'error',
          message: `Train ${trainNumber}, ${stationCode}: no valid time found.`,
          source: 'schedule',
          trainNumber,
          stationCode,
          rowNumber: rowIndex + 1,
        });
        continue;
      }

      const arrRaw = arrivalRaw || null;
      const depRaw = departureRaw || null;

      const arrClock = arrRaw ? parseClock(arrRaw) : null;
      const depClock = depRaw ? parseClock(depRaw) : null;

      if ((arrRaw && !arrClock) || (depRaw && !depClock)) {
        issues.push({
          level: 'error',
          message: `Train ${trainNumber}, ${stationCode}: invalid time format.`,
          source: 'schedule',
          trainNumber,
          stationCode,
          rowNumber: rowIndex + 1,
        });
        continue;
      }

      // Preserve stoppage times if columns exist
      const stoppageTimeRaw = colIdx.stpgTime !== -1 ? row[colIdx.stpgTime]?.trim() : undefined;
      const continuousStoppageTimeRaw = colIdx.cstpgTime !== -1 ? row[colIdx.cstpgTime]?.trim() : undefined;

      const stop = {
        stationCode,
        arrivalRaw: arrRaw,
        departureRaw: depRaw,
        arrivalClock: arrClock,
        departureClock: depClock,
        arrivalDay: null,
        departureDay: null,
        arrivalAbs: null,
        departureAbs: null,
        distance: null, // resolved later against route file
        isHaltInvalid: false,
        // New fields
        stoppageTime: stoppageTimeRaw != null && stoppageTimeRaw !== '' ? Number(stoppageTimeRaw) : undefined,
        continuousStoppageTime: continuousStoppageTimeRaw != null && continuousStoppageTimeRaw !== '' ? Number(continuousStoppageTimeRaw) : undefined,
        // Existing optional fields
        prevBlock: row[colIdx.blockSection]?.trim() || undefined,
        prevBlockLine: undefined,
        nextBlock: row[colIdx.coBlockSection]?.trim() || undefined,
        nextBlockLine: undefined,
        stationLine: row[colIdx.stationLine]?.trim() || undefined,
        blockExitTimeRaw: undefined,
      };
      stops.push({ stop, explicitDay: dayRaw ? parseInt(dayRaw, 10) - 1 : null });
    }

    if (stops.length === 0) {
      issues.push({ level: 'error', message: `Train ${trainNumber}: no valid stops found.`, source: 'schedule', trainNumber });
      continue;
    }

    // Build flat list with explicit day for assignDayOffsets
    const flat = [];
    stops.forEach((entry, idx) => {
      const { stop, explicitDay } = entry;
      if (stop.arrivalRaw) flat.push({ kind: 'arr', idx, raw: stop.arrivalRaw, explicitDay });
      if (stop.departureRaw) flat.push({ kind: 'dep', idx, raw: stop.departureRaw, explicitDay });
    });

    const withDays = assignDayOffsets(
      flat,
      (i) => i.raw,
      (i) => i.explicitDay
    );

    const arrByIdx = new Map();
    const depByIdx = new Map();
    withDays.forEach((item) => {
      if (item.kind === 'arr') arrByIdx.set(item.idx, item);
      else depByIdx.set(item.idx, item);
    });

    let maxDay = 0;
    const finalStops = stops.map((entry, idx) => {
      const arr = arrByIdx.get(idx) || null;
      const dep = depByIdx.get(idx) || null;
      if (arr) maxDay = Math.max(maxDay, arr.day);
      if (dep) maxDay = Math.max(maxDay, dep.day);

      const isHaltInvalid = !!(arr && dep && dep.absMinutes < arr.absMinutes);
      if (isHaltInvalid) {
        issues.push({
          level: 'error',
          message: `Train ${trainNumber}, ${entry.stop.stationCode}: departure before arrival.`,
          source: 'schedule',
          trainNumber,
          stationCode: entry.stop.stationCode,
        });
      }

      return {
        ...entry.stop,
        arrivalDay: arr ? arr.day : null,
        departureDay: dep ? dep.day : null,
        arrivalAbs: arr ? arr.absMinutes : null,
        departureAbs: dep ? dep.absMinutes : null,
        isHaltInvalid,
      };
    });

    trains.push({
      trainNumber,
      trainName: '',
      color: null,
      dashPattern: null,
      stops: finalStops,
      maxDay,
    });
  }

  if (trains.length === 0) {
    issues.push({ level: 'error', message: 'No valid trains could be parsed from the schedule file.', source: 'schedule' });
  }
  return { trains, issues };
}

// ==================== EXISTING COLUMN‑BASED PARSER (UNCHANGED) ====================

function detectColumnBased(rows) {
  if (rows.length === 0) return false;
  const header = rows[0].map((c) => c.toLowerCase().trim());
  return header.includes('train') && header.includes('station');
}

function parseColumnBased(rows, issues) {
  // Existing code, unchanged
  const header = rows[0].map((c) => c.toLowerCase().trim());
  const colIdx = {
    train: header.indexOf('train'),
    station: header.indexOf('station'),
    stationLine: header.indexOf('station_line'),
    entryTime: header.indexOf('entry_time'),
    exitTime: header.indexOf('exit_time'),
    blockExitTime: header.indexOf('block_exit_time'),
    prevBlock: header.indexOf('prev_block'),
    prevBlockLine: header.indexOf('prev_block_line'),
    nextBlock: header.indexOf('next_block'),
    nextBlockLine: header.indexOf('next_block_line'),
  };

  if (colIdx.train === -1 || colIdx.station === -1) {
    issues.push({ level: 'error', message: 'Column‑based schedule requires at least "Train" and "Station" columns.', source: 'schedule' });
    return { trains: [], issues };
  }

  const trainMap = new Map();
  const trainOrder = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const trainVal = row[colIdx.train]?.trim();
    const stationVal = row[colIdx.station]?.trim();
    if (!trainVal || !stationVal) continue;

    if (!trainMap.has(trainVal)) {
      trainMap.set(trainVal, []);
      trainOrder.push(trainVal);
    }
    trainMap.get(trainVal).push(row);
  }

  const trains = [];
  for (const trainNumber of trainOrder) {
    const stopRows = trainMap.get(trainNumber);
    const stops = [];
    let maxDay = 0;

    for (let idx = 0; idx < stopRows.length; idx++) {
      const row = stopRows[idx];
      const stationCode = row[colIdx.station].trim().toUpperCase();
      const entryRaw = row[colIdx.entryTime]?.trim() || null;
      const exitRaw = row[colIdx.exitTime]?.trim() || null;

      const arrivalRaw = convertTimeValue(entryRaw);
      const departureRaw = convertTimeValue(exitRaw);

      if (!arrivalRaw && !departureRaw) {
        issues.push({
          level: 'error',
          message: `Train ${trainNumber}, ${stationCode}: no valid time found.`,
          source: 'schedule',
          trainNumber,
          stationCode,
        });
        continue;
      }

      const arrRaw = arrivalRaw || departureRaw;
      const depRaw = departureRaw || arrivalRaw;

      const arrClock = parseClock(arrRaw);
      const depClock = parseClock(depRaw);
      if (!arrClock || !depClock) {
        issues.push({
          level: 'error',
          message: `Train ${trainNumber}, ${stationCode}: invalid time format.`,
          source: 'schedule',
          trainNumber,
          stationCode,
        });
        continue;
      }

      const blockExitRawCell = row[colIdx.blockExitTime]?.trim() || undefined;
      const stop = {
        stationCode,
        arrivalRaw: arrRaw,
        departureRaw: depRaw,
        arrivalClock: arrClock,
        departureClock: depClock,
        arrivalDay: null,
        departureDay: null,
        arrivalAbs: null,
        departureAbs: null,
        distance: null,
        isHaltInvalid: false,
        prevBlock: row[colIdx.prevBlock]?.trim() || undefined,
        prevBlockLine: row[colIdx.prevBlockLine]?.trim() || undefined,
        nextBlock: row[colIdx.nextBlock]?.trim() || undefined,
        nextBlockLine: row[colIdx.nextBlockLine]?.trim() || undefined,
        stationLine: colIdx.stationLine !== -1 ? (row[colIdx.stationLine]?.trim() || undefined) : undefined,
        blockExitTimeRaw: blockExitRawCell ? (convertTimeValue(blockExitRawCell) || blockExitRawCell) : undefined,
      };
      stops.push(stop);
    }

    if (stops.length === 0) {
      issues.push({ level: 'error', message: `Train ${trainNumber}: no valid stops found.`, source: 'schedule', trainNumber });
      continue;
    }

    const flat = [];
    stops.forEach((stop, idx) => {
      if (stop.arrivalRaw) flat.push({ kind: 'arr', idx, raw: stop.arrivalRaw });
      if (stop.departureRaw) flat.push({ kind: 'dep', idx, raw: stop.departureRaw });
    });
    const withDays = assignDayOffsets(flat, (i) => i.raw);
    const arrByIdx = new Map();
    const depByIdx = new Map();
    withDays.forEach((item) => {
      if (item.kind === 'arr') arrByIdx.set(item.idx, item);
      else depByIdx.set(item.idx, item);
    });

    stops.forEach((stop, idx) => {
      const arr = arrByIdx.get(idx) || null;
      const dep = depByIdx.get(idx) || null;
      stop.arrivalDay = arr ? arr.day : null;
      stop.departureDay = dep ? dep.day : null;
      stop.arrivalAbs = arr ? arr.absMinutes : null;
      stop.departureAbs = dep ? dep.absMinutes : null;
      stop.isHaltInvalid = !!(arr && dep && dep.absMinutes < arr.absMinutes);
      maxDay = Math.max(maxDay, stop.arrivalDay ?? 0, stop.departureDay ?? 0);
    });

    trains.push({
      trainNumber,
      trainName: '',
      color: null,
      dashPattern: null,
      stops,
      maxDay,
    });
  }

  if (trains.length === 0) {
    issues.push({ level: 'error', message: 'No valid trains could be parsed from the schedule file.', source: 'schedule' });
  }
  return { trains, issues };
}

function convertTimeValue(value) {
  if (!value) return null;
  const str = String(value).trim();

  const hmMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hmMatch) {
    return `${hmMatch[1].padStart(2, '0')}:${hmMatch[2]}`;
  }

  const num = Number(str);
  if (Number.isNaN(num)) return null;

  if (num < 1) {
    return secondsToClockStr(Math.round(num * 86400) % 86400);
  }

  return secondsToClockStr(Math.round(num) % 86400);
}

function secondsToClockStr(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ==================== EXISTING TEXT‑BASED HELPERS (UNCHANGED) ====================

function looksLikeHeader(row) {
  const text = row.join(' ').toLowerCase();
  return /station/.test(text) && (/arrival/.test(text) || /departure/.test(text));
}

function extractTimes(rowText, restTokens) {
  let arrivalRaw = null;
  let departureRaw = null;

  const arrMatch = rowText.match(ARRIVAL_RE);
  if (arrMatch) arrivalRaw = arrMatch[1];
  const depMatch = rowText.match(DEPARTURE_RE);
  if (depMatch) departureRaw = depMatch[1];

  if (!arrivalRaw && !departureRaw) {
    const bareTimes = restTokens.map((c) => c.match(BARE_TIME_RE)).filter(Boolean).map((m) => m[1]);
    if (bareTimes.length === 1) {
      arrivalRaw = bareTimes[0];
      departureRaw = bareTimes[0];
    } else if (bareTimes.length >= 2) {
      [arrivalRaw, departureRaw] = bareTimes;
    }
  }

  return { arrivalRaw, departureRaw };
}

function buildTrain(rt, issues) {
  if (rt.stopRows.length === 0) {
    issues.push({ level: 'error', message: `Train ${rt.trainNumber}: no station stops found.`, source: 'schedule', trainNumber: rt.trainNumber });
    return null;
  }

  const flat = [];
  rt.stopRows.forEach((stop, idx) => {
    if (stop.arrivalRaw) flat.push({ kind: 'arr', idx, raw: stop.arrivalRaw });
    if (stop.departureRaw) flat.push({ kind: 'dep', idx, raw: stop.departureRaw });
  });

  const withDays = assignDayOffsets(flat, (i) => i.raw);
  const arrByIdx = new Map();
  const depByIdx = new Map();
  withDays.forEach((item) => {
    if (item.kind === 'arr') arrByIdx.set(item.idx, item);
    else depByIdx.set(item.idx, item);
  });

  let maxDay = 0;
  const stops = rt.stopRows.map((stop, idx) => {
    const arr = arrByIdx.get(idx) || null;
    const dep = depByIdx.get(idx) || null;
    if (arr) maxDay = Math.max(maxDay, arr.day);
    if (dep) maxDay = Math.max(maxDay, dep.day);

    const isHaltInvalid = !!(arr && dep && dep.absMinutes < arr.absMinutes);
    if (isHaltInvalid) {
      issues.push({
        level: 'error',
        message: `Train ${rt.trainNumber}, ${stop.stationCode}: departure (${dep.raw}) is before arrival (${arr.raw}).`,
        source: 'schedule',
        trainNumber: rt.trainNumber,
        stationCode: stop.stationCode,
        rowNumber: stop.rowNumber,
      });
    }
    if (!arr && !dep) {
      issues.push({
        level: 'error',
        message: `Train ${rt.trainNumber}, ${stop.stationCode}: could not read a valid arrival/departure time.`,
        source: 'schedule',
        trainNumber: rt.trainNumber,
        stationCode: stop.stationCode,
        rowNumber: stop.rowNumber,
      });
    }

    return {
      stationCode: stop.stationCode,
      arrivalRaw: stop.arrivalRaw,
      departureRaw: stop.departureRaw,
      arrivalClock: arr ? arr.clock : null,
      departureClock: dep ? dep.clock : null,
      arrivalDay: arr ? arr.day : null,
      departureDay: dep ? dep.day : null,
      arrivalAbs: arr ? arr.absMinutes : null,
      departureAbs: dep ? dep.absMinutes : null,
      distance: null,
      isHaltInvalid,
    };
  });

  for (let i = 1; i < stops.length; i++) {
    const prevOut = stops[i - 1].departureAbs ?? stops[i - 1].arrivalAbs;
    const nextIn = stops[i].arrivalAbs ?? stops[i].departureAbs;
    if (prevOut != null && nextIn != null && nextIn < prevOut) {
      issues.push({
        level: 'error',
        message: `Train ${rt.trainNumber}: time at ${stops[i].stationCode} is earlier than the previous station (${stops[i - 1].stationCode}). Check for a missing day/date change.`,
        source: 'schedule',
        trainNumber: rt.trainNumber,
        stationCode: stops[i].stationCode,
      });
    }
  }

  return {
    trainNumber: rt.trainNumber,
    trainName: rt.trainName || '',
    color: null,
    dashPattern: null,
    stops,
    maxDay,
  };
}