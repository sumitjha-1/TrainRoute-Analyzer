import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { formatClock } from '../utils/time/time';
import { buildTrainDaySegments } from '../utils/graph/pathBuilder';


const MAX_CANVAS_SIDE = 16000;       // px
const MAX_CANVAS_AREA = 24_000_000;  // px^2
const MIN_USABLE_SCALE = 0.3;

export function planExportScale(width, height, wanted = 2) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const bySide = MAX_CANVAS_SIDE / Math.max(w, h);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (w * h));
  const scale = Math.min(wanted, bySide, byArea);
  return { scale, tooBig: scale < MIN_USABLE_SCALE };
}

export const EXPORT_TOO_BIG_MESSAGE =
  'This graph is too large to export as a single image (too many day columns). Switch to Weekly or Layered view, ' +
  'show fewer days (day filter) or fewer trains, then try again.';

async function renderGraphCanvas(el) {
  const w = el.scrollWidth;
  const h = el.scrollHeight;
  const { scale, tooBig } = planExportScale(w, h);
  if (tooBig) throw new Error(EXPORT_TOO_BIG_MESSAGE);

  const bg = getComputedStyle(document.body).getPropertyValue('--bg-canvas').trim() || '#0D1729';
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint before the heavy work starts

  return html2canvas(el, {
    backgroundColor: bg,
    scale,
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    logging: false,
    onclone: (doc) => {
      // strip things that are very slow to rasterise and invisible/unneeded in an export
      const st = doc.createElement('style');
      st.textContent =
        '*{filter:none !important;animation:none !important;backdrop-filter:none !important;}' +
        '.graph-point-error{display:none !important;}';
      doc.head.appendChild(st);
      doc.querySelectorAll('line[stroke-dasharray="1 5"]').forEach((n) => n.remove()); // minor dots
    },
  });
}

export async function exportGraphAsPNG(scrollAreaEl, filename = 'railway-chart.png') {
  const canvas = await renderGraphCanvas(scrollAreaEl);
  downloadDataUrl(canvas.toDataURL('image/png'), filename);
}

export async function exportGraphAsPDF(scrollAreaEl, filename = 'railway-chart.pdf') {
  const canvas = await renderGraphCanvas(scrollAreaEl);
  // JPEG is much faster / smaller than PNG for a big canvas
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const orientation = canvas.width > canvas.height ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height], compress: true });
  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

// ---------------------------------------------------------------------
//  ALL-TRAINS PDF  (vector drawing — no screenshot, so it never freezes)
// ---------------------------------------------------------------------
// The graph is drawn straight into the PDF as lines and text, one page per day.
// There is no huge canvas and no on-screen rendering, so 500+ trains are fine.

function toRgb(color) {
  const c = String(color || '').trim();
  if (c[0] === '#') {
    const n = parseInt(c.length === 4 ? c.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3').slice(1) : c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (m) {
    const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
    const hue = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
  }
  return [200, 200, 200];
}

export async function exportAllTrainsVectorPDF(
  trains,
  stations,
  filename = 'railway-chart-all-trains.pdf',
  originalTrains = {},
  includePrevious = true
) {
  if (!stations || stations.length === 0 || !trains || trains.length === 0) {
    throw new Error('Nothing to export — load a route and a schedule file first.');
  }

  // per train, per day segments
  const sig = (t) => t.stops.map((x) => `${x.stationCode}|${x.arrivalAbs}|${x.departureAbs}`).join(';');
  const perTrain = trains.map((train) => {
    const cur = buildTrainDaySegments(train);
    const orig = includePrevious && originalTrains ? originalTrains[train.trainNumber] : null;
    // the original path is only drawn for trains whose path really changed (and only if requested)
    const prev = orig && sig(orig) !== sig(train) ? buildTrainDaySegments(orig) : null;
    return { train, ...cur, prevByDay: prev ? prev.segmentsByDay : null };
  });
  const dayList = Array.from(new Set(perTrain.flatMap((pt) => [
    ...Array.from(pt.segmentsByDay.keys()),
    ...(pt.prevByDay ? Array.from(pt.prevByDay.keys()) : []),
  ]))).sort((a, b) => a - b);
  const hasAnyPrev = perTrain.some((pt) => pt.prevByDay);
  if (dayList.length === 0) throw new Error('No train paths to draw.');

  // page geometry (pt)
  const PX_PER_MIN = 1.1;
  const L = 90, R = 30, T = 56, B = 40;
  const plotW = 1440 * PX_PER_MIN;
  const W = L + plotW + R;
  let rowH = 14;
  const MAX_H = 14000; // PDF page limit is 14400
  if (T + B + stations.length * rowH > MAX_H) rowH = (MAX_H - T - B) / stations.length;
  const H = T + B + stations.length * rowH;

  const yOfIndex = (i) => T + rowH * (i + 0.5);
  const yByCode = new Map(stations.map((s, i) => [s.stationCode, yOfIndex(i)]));
  const yFromDistance = (dist) => {
    if (dist == null) return null;
    if (dist <= stations[0].distance) return yOfIndex(0);
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1], b = stations[i];
      if (dist <= b.distance) {
        if (b.distance === a.distance) return yOfIndex(i);
        return yOfIndex(i - 1) + (yOfIndex(i) - yOfIndex(i - 1)) * ((dist - a.distance) / (b.distance - a.distance));
      }
    }
    return yOfIndex(stations.length - 1);
  };
  const yOfEnd = (end) => (end.point ? yByCode.get(end.point.stationCode) : undefined) ?? yFromDistance(end.distance);

  const orientation = W > H ? 'l' : 'p';
  const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation, compress: true });

  for (let di = 0; di < dayList.length; di++) {
    const day = dayList[di];
    if (di > 0) pdf.addPage([W, H], orientation);

    // background
    pdf.setFillColor(10, 17, 31);
    pdf.rect(0, 0, W, H, 'F');

    // title
    pdf.setTextColor(231, 236, 246);
    pdf.setFontSize(14);
    pdf.text(`Day ${day + 1}`, L, 28);
    pdf.setFontSize(8);
    pdf.setTextColor(147, 161, 189);
    pdf.text(`${trains.length} trains · ${stations.length} stations`, L + 70, 28);
    if (hasAnyPrev) {
      pdf.text('Wide faded line = original path (before edit)', L + 280, 28);
    }

    // station rows + labels
    pdf.setFontSize(Math.min(7, rowH - 2));
    stations.forEach((s, i) => {
      const y = yOfIndex(i);
      pdf.setDrawColor(36, 48, 72);
      pdf.setLineWidth(0.3);
      pdf.line(L, y, L + plotW, y);
      pdf.setTextColor(200, 210, 230);
      pdf.text(`${s.stationCode}  ${s.distance}km`, L - 6, y + 2.5, { align: 'right' });
    });

    // hour lines + labels
    for (let h = 0; h <= 24; h++) {
      const x = L + h * 60 * PX_PER_MIN;
      pdf.setDrawColor(h % 6 === 0 ? 90 : 52, h % 6 === 0 ? 102 : 62, h % 6 === 0 ? 130 : 86);
      pdf.setLineWidth(h % 6 === 0 ? 0.8 : 0.4);
      pdf.line(x, T, x, H - B);
      pdf.setTextColor(147, 161, 189);
      pdf.setFontSize(8);
      pdf.text(String(h).padStart(2, '0'), x, T - 6, { align: 'center' });
      pdf.text(String(h).padStart(2, '0'), x, H - B + 14, { align: 'center' });
    }

    // original (previous) paths of edited trains: wide, faded "highlighter" line behind the current path
    if (hasAnyPrev) {
      // NOTE: jsPDF needs 'stroke-opacity' for lines; 'opacity' alone only affects fills.
      const faded = new pdf.GState({ opacity: 0.14, 'stroke-opacity': 0.14 });
      const solid = new pdf.GState({ opacity: 1, 'stroke-opacity': 1 });
      pdf.setGState(faded);
      pdf.setLineWidth(4.5);
      pdf.setLineCap('round');
      perTrain.forEach(({ train, prevByDay }) => {
        const segs = prevByDay && prevByDay.get(day);
        if (!segs) return;
        const [r, g, b] = toRgb(train.color);
        pdf.setDrawColor(r, g, b);
        segs.forEach((seg) => {
          const y1 = yOfEnd(seg.from);
          const y2 = yOfEnd(seg.to);
          if (y1 == null || y2 == null) return;
          pdf.line(L + seg.from.minutesOfDay * PX_PER_MIN, y1, L + seg.to.minutesOfDay * PX_PER_MIN, y2);
        });
      });
      pdf.setGState(solid);
      pdf.setLineCap('butt');
    }

    // train paths
    pdf.setLineWidth(0.7);
    pdf.setFontSize(5.5);
    perTrain.forEach(({ train, segmentsByDay }) => {
      const segs = segmentsByDay.get(day);
      if (!segs || segs.length === 0) return;
      const [r, g, b] = toRgb(train.color);
      pdf.setDrawColor(r, g, b);
      let labelled = false;
      segs.forEach((seg) => {
        const y1 = yOfEnd(seg.from);
        const y2 = yOfEnd(seg.to);
        if (y1 == null || y2 == null) return;
        const x1 = L + seg.from.minutesOfDay * PX_PER_MIN;
        const x2 = L + seg.to.minutesOfDay * PX_PER_MIN;
        pdf.line(x1, y1, x2, y2);
        if (!labelled && seg.from.point) {
          pdf.setTextColor(r, g, b);
          pdf.text(String(train.trainNumber), x1 + 2, y1 - 2);
          labelled = true;
        }
      });
    });

    // let the browser breathe between pages
    await new Promise((res) => setTimeout(res, 0));
  }

  pdf.save(filename);
}

export function exportTrainsAsCSV(trains, filename = 'train-schedule.csv', originalTrains = null) {
  // Edited vs not edited: previous (uploaded) timing is compared with the current timing.
  const orig = new Map((originalTrains || []).map((t) => [t.trainNumber, t]));
  const header = [
    'Train Number', 'Train Name', 'Station', 'Distance (km)', 'Arrival', 'Departure', 'Day',
    'Prev Arrival', 'Prev Departure', 'Time Changed', 'Train Status',
  ];
  const rows = [header];
  trains.forEach((train) => {
    const o = orig.get(train.trainNumber);
    const byCode = new Map();
    (o?.stops || []).forEach((s) => {
      if (!byCode.has(s.stationCode)) byCode.set(s.stationCode, []);
      byCode.get(s.stationCode).push(s);
    });
    const used = new Map();
    const trainRows = [];
    let trainEdited = false;
    train.stops.forEach((stop) => {
      const n = used.get(stop.stationCode) || 0;
      used.set(stop.stationCode, n + 1);
      const p = byCode.get(stop.stationCode)?.[n];
      const ca = stop.arrivalClock ? formatClock(stop.arrivalClock) : '';
      const cd = stop.departureClock ? formatClock(stop.departureClock) : '';
      const pa = p ? fmtClock(p.arrivalClock) : ca;
      const pd = p ? fmtClock(p.departureClock) : cd;
      const changed = pa !== ca || pd !== cd;
      if (changed) trainEdited = true;
      trainRows.push([
        train.trainNumber,
        train.trainName || '',
        stop.stationCode,
        stop.distance ?? '',
        ca,
        cd,
        Math.max(stop.arrivalDay ?? 0, stop.departureDay ?? 0) + 1,
        pa,
        pd,
        changed ? 'YES' : '',
      ]);
    });
    trainRows.forEach((r) => rows.push([...r, trainEdited ? 'EDITED' : 'NOT EDITED']));
  });
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

const EXTRA_HEADERS = ['PREV_ARRIVAL', 'PREV_DEPARTURE', 'CURR_ARRIVAL', 'CURR_DEPARTURE', 'TIME_CHANGED', 'TRAIN_STATUS'];
// TIME_CHANGED  -> YES on every row (station) whose arrival / departure was edited
// TRAIN_STATUS  -> EDITED on every row of a train that has at least one edited row, else NOT EDITED

function convertTimeValue(value) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;
  const hm = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`;
  const num = Number(str);
  if (Number.isNaN(num)) return null;
  const secs = num < 1 ? Math.round(num * 86400) % 86400 : Math.round(num) % 86400;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Writes `hhmm` in the same style as the cell it replaces. */
function likeOriginal(orig, hhmm) {
  const s = String(orig ?? '').trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return `${hhmm}:00`;
  return hhmm;
}

const fmtClock = (c) => (c ? formatClock(c) : '');

function mergedLayout(header) {
  const ix = (n) => header.indexOf(n);
  return {
    kind: 'merged',
    train: ix('mavtrainnumber'),
    station: ix('mavsttncode'),
    seq: ix('manseqnumber'),
    wttArr: ix('manwttarvl'), wttDep: ix('manwttdprt'), wttDay: ix('manwttdayofrun'),
    pttArr: ix('manpttarvl'), pttDep: ix('manpttdprt'), pttDay: ix('manpttdayofrun'),
  };
}

function columnLayout(header) {
  const ix = (n) => header.indexOf(n);
  return { kind: 'column', train: ix('train'), station: ix('station'), entry: ix('entry_time'), exit: ix('exit_time') };
}

/** What the parser read from one source row: { arr, dep, arrCol, depCol } (HH:MM strings or null). */
function readEvents(layout, row) {
  if (layout.kind === 'merged') {
    const wa = convertTimeValue(row[layout.wttArr]);
    const pa = convertTimeValue(row[layout.pttArr]);
    const wd = convertTimeValue(row[layout.wttDep]);
    const pd = convertTimeValue(row[layout.pttDep]);
    return {
      arr: wa || pa, arrCol: wa ? layout.wttArr : pa ? layout.pttArr : -1,
      dep: wd || pd, depCol: wd ? layout.wttDep : pd ? layout.pttDep : -1,
    };
  }
  const en = convertTimeValue(row[layout.entry]);
  const ex = convertTimeValue(row[layout.exit]);
  return { arr: en || ex, dep: ex || en, arrCol: layout.entry, depCol: layout.exit, en, ex };
}

function baseName(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/**
 * @param {{fileName:string, ext:string, rows:string[][], originalTrains:any[]}} source
 * @param {any[]} trains   trains to include (current, edited data)
 */
export function exportScheduleInOriginalFormat(source, trains, filename) {
  const { rows, ext, fileName } = source;
  const outName = filename || `${baseName(fileName)}_edited.${ext === 'xls' ? 'xls' : ext === 'txt' ? 'txt' : ext === 'csv' ? 'csv' : 'xlsx'}`;
  if (!rows || rows.length === 0) return exportScheduleFallback(source, trains, outName);

  const header = rows[0].map((c) => c.toLowerCase().trim());
  const isMerged = header.includes('mavtrainnumber') && header.includes('mavsttncode');
  const isColumn = !isMerged && header.includes('train') && header.includes('station');
  if (!isMerged && !isColumn) return exportScheduleFallback(source, trains, outName);

  const layout = isMerged ? mergedLayout(header) : columnLayout(header);
  const trainSet = new Set(trains.map((t) => t.trainNumber));
  const trainByNo = new Map(trains.map((t) => [t.trainNumber, t]));

  // group the valid source rows per train, in the same order the parser used
  const groups = new Map(); // trainNo -> [{ i, code }]
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tv = row[layout.train]?.trim();
    const sv = row[layout.station]?.trim();
    if (!tv || !sv) continue;
    const ev = readEvents(layout, row);
    if (!ev.arr && !ev.dep) continue; // the parser dropped these rows too
    if (!groups.has(tv)) groups.set(tv, []);
    groups.get(tv).push({ i, code: sv.toUpperCase() });
  }
  if (isMerged && layout.seq !== -1) {
    groups.forEach((list) =>
      list.sort((a, b) => parseInt(rows[a.i][layout.seq] || '0', 10) - parseInt(rows[b.i][layout.seq] || '0', 10))
    );
  }

  // source row index -> current stop
  const stopByRow = new Map();
  trains.forEach((train) => {
    const list = groups.get(train.trainNumber);
    if (!list) return;
    const used = new Map();
    const rowsByCode = new Map();
    list.forEach((g) => {
      if (!rowsByCode.has(g.code)) rowsByCode.set(g.code, []);
      rowsByCode.get(g.code).push(g.i);
    });
    train.stops.forEach((stop) => {
      const n = used.get(stop.stationCode) || 0;
      used.set(stop.stationCode, n + 1);
      const rowIdx = rowsByCode.get(stop.stationCode)?.[n];
      if (rowIdx != null) stopByRow.set(rowIdx, stop);
    });
  });

  const outRows = [[...rows[0], ...EXTRA_HEADERS]];
  const editedTrainSet = new Set();
  const outTrainNos = [null]; // train number of every outRows entry (header = null)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tv = row[layout.train]?.trim();
    if (!tv || !trainSet.has(tv)) continue;
    void trainByNo;

    const r = [...row];
    while (r.length < rows[0].length) r.push('');

    const ev = readEvents(layout, row);
    const stop = stopByRow.get(i);
    const prevArr = ev.arr || '';
    const prevDep = ev.dep || '';
    let curArr = prevArr;
    let curDep = prevDep;

    if (stop) {
      curArr = fmtClock(stop.arrivalClock);
      curDep = fmtClock(stop.departureClock);
      let touched = false;

      if (layout.kind === 'merged') {
        if (ev.arrCol >= 0 && curArr && curArr !== ev.arr) { r[ev.arrCol] = likeOriginal(row[ev.arrCol], curArr); touched = true; }
        if (ev.depCol >= 0 && curDep && curDep !== ev.dep) { r[ev.depCol] = likeOriginal(row[ev.depCol], curDep); touched = true; }
        if (touched) {
          const day = String((stop.arrivalDay ?? stop.departureDay ?? 0) + 1);
          if (layout.wttDay !== -1 && String(row[layout.wttDay] ?? '').trim()) r[layout.wttDay] = day;
          else if (layout.pttDay !== -1 && String(row[layout.pttDay] ?? '').trim()) r[layout.pttDay] = day;
        }
      } else {
        const cell = (col, orig, cur, other) => {
          if (col === -1) return;
          const had = String(row[col] ?? '').trim() !== '';
          if (had) { if (cur && cur !== orig) r[col] = likeOriginal(row[col], cur); }
          else if (cur && cur !== other) r[col] = cur; // an empty cell became a real, distinct time
        };
        cell(layout.entry, ev.en, curArr, curDep);
        cell(layout.exit, ev.ex, curDep, curArr);
      }
    }

    const changed = curArr !== prevArr || curDep !== prevDep;
    r.push(prevArr, prevDep, curArr, curDep, changed ? 'YES' : '', '');
    if (changed) editedTrainSet.add(tv);
    outTrainNos.push(tv);
    outRows.push(r);
  }

  // fill TRAIN_STATUS (last column) now that we know which trains were edited
  for (let k = 1; k < outRows.length; k++) {
    outRows[k][outRows[k].length - 1] = editedTrainSet.has(outTrainNos[k]) ? 'EDITED' : 'NOT EDITED';
  }

  writeTable(outRows, ext, outName);
}

/** For schedule layouts that cannot be rewritten in place (plain text files): simple prev/current table. */
function exportScheduleFallback(source, trains, filename) {
  const orig = new Map((source?.originalTrains || []).map((t) => [t.trainNumber, t]));
  const out = [['Train Number', 'Station', 'PREV_ARRIVAL', 'PREV_DEPARTURE', 'CURR_ARRIVAL', 'CURR_DEPARTURE', 'TIME_CHANGED', 'TRAIN_STATUS']];
  trains.forEach((train) => {
    const firstRow = out.length;
    const o = orig.get(train.trainNumber);
    const used = new Map();
    const byCode = new Map();
    (o?.stops || []).forEach((s) => {
      if (!byCode.has(s.stationCode)) byCode.set(s.stationCode, []);
      byCode.get(s.stationCode).push(s);
    });
    train.stops.forEach((stop) => {
      const n = used.get(stop.stationCode) || 0;
      used.set(stop.stationCode, n + 1);
      const p = byCode.get(stop.stationCode)?.[n];
      const pa = fmtClock(p?.arrivalClock);
      const pd = fmtClock(p?.departureClock);
      const ca = fmtClock(stop.arrivalClock);
      const cd = fmtClock(stop.departureClock);
      out.push([train.trainNumber, stop.stationCode, pa, pd, ca, cd, pa !== ca || pd !== cd ? 'YES' : '', '']);
    });
    const edited = out.slice(firstRow).some((row) => row[6] === 'YES');
    for (let k = firstRow; k < out.length; k++) out[k][7] = edited ? 'EDITED' : 'NOT EDITED';
  });
  writeTable(out, 'csv', (filename || 'schedule.csv').replace(/\.[^.]+$/, '') + '.csv');
}

function writeTable(table, ext, filename) {
  if (ext === 'xlsx' || ext === 'xls') {
    const ws = XLSX.utils.aoa_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    const bookType = ext === 'xls' ? 'xls' : 'xlsx';
    const data = XLSX.write(wb, { bookType, type: 'array' });
    const mime = bookType === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    downloadBlob(new Blob([data], { type: mime }), filename);
    return;
  }
  const text = table.map((r) => r.map(csvEscape).join(',')).join('\n');
  downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8;' }), filename);
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}