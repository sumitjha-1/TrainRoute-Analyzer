import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Reads any supported file (.csv, .txt, .xlsx, .xls) into a plain array of
 * rows, each row an array of trimmed string cells. This is the ONLY place
 * that touches papaparse/xlsx, so adding a new format later means editing
 * only this file.
 */
export async function readRawTable(file) {
  const ext = getExtension(file.name);

  if (ext === 'xlsx' || ext === 'xls') {
    return readSpreadsheet(file);
  }
  if (ext === 'csv' || ext === 'txt') {
    return readDelimited(file);
  }
  throw new UnsupportedFileError(ext);
}

export class UnsupportedFileError extends Error {
  constructor(ext) {
    super(`Unsupported file type ".${ext}". Supported: .csv, .txt, .xlsx, .xls`);
    this.name = 'UnsupportedFileError';
  }
}

function getExtension(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function readSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        resolve(normalizeRows(rows));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

function readDelimited(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', ';', '|', /\s{2,}/],
      complete: (results) => {
        // If comma/delimiter guess produced single-column rows for a .txt file
        // that's actually whitespace-separated, fall back to a whitespace split.
        let rows = results.data;
        const looksUnsplit = rows.length > 0 && rows.every((r) => r.length <= 1);
        if (looksUnsplit) {
          rows = rows.map((r) => (r[0] || '').trim().split(/\s{2,}|\t/).filter(Boolean));
        }
        resolve(normalizeRows(rows));
      },
      error: (err) => reject(err),
    });
  });
}

function normalizeRows(rows) {
  return rows
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell).trim())))
    .filter((row) => row.some((cell) => cell !== ''));
}