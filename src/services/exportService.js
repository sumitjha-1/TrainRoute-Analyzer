import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { formatClock } from '../utils/time/time';

export async function exportGraphAsPNG(scrollAreaEl, filename = 'railway-chart.png') {
  const canvas = await html2canvas(scrollAreaEl, {
    backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-canvas') || '#0D1729',
    scale: 2,
    width: scrollAreaEl.scrollWidth,
    height: scrollAreaEl.scrollHeight,
    windowWidth: scrollAreaEl.scrollWidth,
    windowHeight: scrollAreaEl.scrollHeight,
  });
  downloadDataUrl(canvas.toDataURL('image/png'), filename);
}

export async function exportGraphAsPDF(scrollAreaEl, filename = 'railway-chart.pdf') {
  const bg = getComputedStyle(document.body).getPropertyValue('--bg-canvas') || '#0D1729';
  const canvas = await html2canvas(scrollAreaEl, {
    backgroundColor: bg,
    scale: 2,
    width: scrollAreaEl.scrollWidth,
    height: scrollAreaEl.scrollHeight,
    windowWidth: scrollAreaEl.scrollWidth,
    windowHeight: scrollAreaEl.scrollHeight,
  });
  const imgData = canvas.toDataURL('image/png');
  const orientation = canvas.width > canvas.height ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

export function exportTrainsAsCSV(trains, filename = 'train-schedule.csv') {
  const header = ['Train Number', 'Train Name', 'Station', 'Distance (km)', 'Arrival', 'Departure', 'Day'];
  const rows = [header];
  trains.forEach((train) => {
    train.stops.forEach((stop) => {
      rows.push([
        train.trainNumber,
        train.trainName || '',
        stop.stationCode,
        stop.distance ?? '',
        stop.arrivalClock ? formatClock(stop.arrivalClock) : '',
        stop.departureClock ? formatClock(stop.departureClock) : '',
        Math.max(stop.arrivalDay ?? 0, stop.departureDay ?? 0) + 1,
      ]);
    });
  });
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
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