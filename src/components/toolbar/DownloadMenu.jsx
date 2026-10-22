import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Image, FileText, Table, FileSpreadsheet } from 'lucide-react';
import { useAppStore, getVisibleTrains } from '../../store/useAppStore';
import { panelWidth, STATION_LABEL_COL_WIDTH } from '../../utils/graph/coordinates';
import {
  planExportScale,
  EXPORT_TOO_BIG_MESSAGE,
  exportGraphAsPNG,
  exportGraphAsPDF,
  exportAllTrainsVectorPDF,
  exportTrainsAsCSV,
  exportScheduleInOriginalFormat,
} from '../../services/exportService';
import './DownloadMenu.css';

const SCOPES = [
  { id: 'all', label: 'All trains' },
  { id: 'filtered', label: 'Currently filtered / visible' },
  { id: 'selected', label: 'Pick trains…' },
  { id: 'single', label: 'Single train' },
];

export function DownloadMenu({ scrollAreaRef }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('filtered');
  const [pickedTrains, setPickedTrains] = useState([]);
  const [singleTrain, setSingleTrain] = useState('');
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);

  const trains = useAppStore((s) => s.trains) || [];
  const selectedTrainNumbers = useAppStore((s) => s.selectedTrainNumbers);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const showOnlyTrains = useAppStore((s) => s.showOnlyTrains);
  const showAllTrains = useAppStore((s) => s.showAllTrains);
  const setExportRendering = useAppStore((s) => s.setExportRendering);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const scheduleSource = useAppStore((s) => s.scheduleSource);
  const viewMode = useAppStore((s) => s.viewMode);
  const dayFilter = useAppStore((s) => s.dayFilter);
  const zoom = useAppStore((s) => s.zoom);

  const visibleTrains = useMemo(
    () => getVisibleTrains({ trains, selectedTrainNumbers, searchQuery }),
    [trains, selectedTrainNumbers, searchQuery]
  );

  // The dropdown is rendered via a portal straight into document.body so the toolbar's
  // overflow can never clip it.
  useLayoutEffect(() => {
    if (!open) return;
    function updatePos() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      const inButton = btnRef.current && btnRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inButton && !inDropdown) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const disabled = trains.length === 0;

  function resolveScopeTrainList() {
    if (scope === 'all') return trains;
    if (scope === 'filtered') return visibleTrains;
    if (scope === 'single') return trains.filter((t) => t.trainNumber === singleTrain);
    if (scope === 'selected') return trains.filter((t) => pickedTrains.includes(t.trainNumber));
    return visibleTrains;
  }

  async function withScopeApplied(trainList, fn) {
    const prevSelection = selectedTrainNumbers;
    const numbers = trainList.map((t) => t.trainNumber);
    showOnlyTrains(numbers);
    setExportRendering(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 150));
    try {
      await fn();
    } catch (err) {
      requestConfirm({
        title: 'Export failed',
        message: `Could not generate the file (${err?.message || 'unknown error'}). Try a smaller scope — fewer trains or a single day — if this keeps happening.`,
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
    } finally {
      setExportRendering(false);
      if (prevSelection == null) showAllTrains();
      else showOnlyTrains(prevSelection);
    }
  }

  function resolveScrollAreaEl() {
    return scrollAreaRef?.current || document.querySelector('.graph-scroll-area');
  }

  function ensureScrollAreaReady() {
    const el = resolveScrollAreaEl();
    if (el) return el;
    requestConfirm({
      title: 'Export failed',
      message: 'No graph is currently displayed — load a route and schedule file, then try again.',
      confirmLabel: 'OK',
      onConfirm: () => {},
    });
    return null;
  }

  // Estimates the exported image size BEFORE anything heavy is rendered; a huge multi-day graph
  // would otherwise freeze the page.
  function exportIsTooLarge(list) {
    const el = resolveScrollAreaEl();
    let panels;
    if (viewMode === 'layered') panels = 1;
    else if (viewMode === 'weekly') panels = 7;
    else {
      const days = new Set();
      list.forEach((t) => t.stops.forEach((s) => {
        [s.arrivalAbs, s.departureAbs].forEach((a) => { if (a != null) days.add(Math.floor(a / 1440)); });
      }));
      panels = dayFilter ? Array.from(days).filter((d) => dayFilter.has(d)).length : days.size;
    }
    const width = Math.max(1, panels) * panelWidth(zoom) + STATION_LABEL_COL_WIDTH * 2;
    const height = el ? el.scrollHeight : 1000;
    // (a) image too big for the browser  (b) too many train-paths to draw at once -> tab freezes
    const tooBigImage = planExportScale(width, height).tooBig;
    const tooManyPaths = Math.max(1, panels) * list.length > 4000;
    if (!tooBigImage && !tooManyPaths) return false;
    requestConfirm({
      title: 'Graph too large to export',
      message: tooManyPaths && !tooBigImage
        ? `${list.length} trains x ${panels} day column(s) is too much to draw at once and would freeze the page. ` +
          'Choose "Pick trains…" / "Single train" or show fewer trains / days, then try again.'
        : EXPORT_TOO_BIG_MESSAGE,
      confirmLabel: 'OK',
      onConfirm: () => {},
    });
    return true;
  }

  async function handlePNG() {
    const el = ensureScrollAreaReady();
    if (!el) return;
    const list = resolveScopeTrainList();
    if (exportIsTooLarge(list)) { setOpen(false); return; }
    await withScopeApplied(list, () => exportGraphAsPNG(el, 'railway-chart.png'));
    setOpen(false);
  }
  async function handlePDF() {
    const el = ensureScrollAreaReady();
    if (!el) return;
    const list = resolveScopeTrainList();
    if (exportIsTooLarge(list)) { setOpen(false); return; }
    await withScopeApplied(list, () => exportGraphAsPDF(el, 'railway-chart.pdf'));
    setOpen(false);
  }
  // Vector PDF: draws every train directly into the PDF (one page per day) — never freezes
  async function handleAllTrainsPDF() {
    const list = resolveScopeTrainList();
    try {
      const st = useAppStore.getState();
      await exportAllTrainsVectorPDF(list, st.stations, undefined, st.originalTrains);
    } catch (err) {
      requestConfirm({
        title: 'Export failed',
        message: `Could not generate the PDF (${err?.message || 'unknown error'}).`,
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
    }
    setOpen(false);
  }
  function handleCSV() {
    const list = resolveScopeTrainList();
    exportTrainsAsCSV(list, `${scope}-trains-schedule.csv`, scheduleSource?.originalTrains);
    setOpen(false);
  }
  // Schedule in the SAME format as the uploaded file, with previous + current timings
  function handleScheduleFile() {
    const list = resolveScopeTrainList();
    try {
      exportScheduleInOriginalFormat(scheduleSource, list);
    } catch (err) {
      requestConfirm({
        title: 'Export failed',
        message: `Could not generate the schedule file (${err?.message || 'unknown error'}).`,
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
    }
    setOpen(false);
  }

  const scopeCount = resolveScopeTrainList().length;

  return (
    <div className="download-menu">
      <button
        ref={btnRef}
        type="button"
        className="toolbar-btn toolbar-btn-download"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Download"
      >
        <Download size={15} /> Download
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="download-dropdown download-dropdown-portal"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="dd-section-title">Export scope</div>
          <div className="dd-scope-list">
            {SCOPES.map((s) => (
              <label key={s.id} className={`dd-scope-row ${scope === s.id ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === s.id}
                  onChange={() => setScope(s.id)}
                />
                {s.label}
              </label>
            ))}
          </div>

          {scope === 'single' && (
            <select className="dd-select" value={singleTrain} onChange={(e) => setSingleTrain(e.target.value)}>
              <option value="">Choose a train…</option>
              {trains.map((t) => (
                <option key={t.trainNumber} value={t.trainNumber}>{t.trainNumber} {t.trainName}</option>
              ))}
            </select>
          )}

          {scope === 'selected' && (
            <div className="dd-pick-list">
              {trains.map((t) => {
                const checked = pickedTrains.includes(t.trainNumber);
                return (
                  <label key={t.trainNumber} className="dd-pick-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setPickedTrains((prev) =>
                        checked ? prev.filter((n) => n !== t.trainNumber) : [...prev, t.trainNumber]
                      )}
                    />
                    <span>{t.trainNumber}</span>
                    {t.trainName && <span className="dd-pick-name">{t.trainName}</span>}
                  </label>
                );
              })}
            </div>
          )}

          <div className="dd-divider" />
          <div className="dd-section-title">{scopeCount} train{scopeCount !== 1 ? 's' : ''} in scope</div>
          <button disabled={scopeCount === 0} onClick={handlePNG}>
            <Image size={14} /> Download graph as PNG
          </button>
          <button
            disabled={scopeCount === 0}
            onClick={handleAllTrainsPDF}
            title="Draws all trains directly into the PDF, one page per day. Works for 500+ trains."
          >
            <FileText size={14} /> Download ALL trains as PDF (1 page / day)
          </button>
          <button
            disabled={scopeCount === 0 || !scheduleSource}
            onClick={handleScheduleFile}
            title="Same format as the uploaded schedule file, with previous & current timings"
          >
            <FileSpreadsheet size={14} /> Download schedule file (uploaded format)
          </button>
          <button disabled={scopeCount === 0} onClick={handleCSV}>
            <Table size={14} /> Download schedule as simple CSV
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}