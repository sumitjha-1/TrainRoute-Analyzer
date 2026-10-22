import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { formatClock } from '../utils/time/time';

//  PNG / PDF of the graph

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