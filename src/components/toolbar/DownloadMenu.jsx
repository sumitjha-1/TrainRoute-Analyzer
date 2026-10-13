import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Image, FileText, Table } from 'lucide-react';
import { useAppStore, getVisibleTrains } from '../../store/useAppStore';
import { exportGraphAsPNG, exportGraphAsPDF, exportTrainsAsCSV } from '../../services/exportService';
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

  const visibleTrains = useMemo(
    () => getVisibleTrains({ trains, selectedTrainNumbers, searchQuery }),
    [trains, selectedTrainNumbers, searchQuery]
  );

  // The dropdown is rendered via a portal straight into document.body — NOT
  // as a child of .toolbar — specifically so the toolbar's
  // overflow-x:auto/overflow-y:hidden (needed to keep it on one line) can
  // never clip it. Position is computed from the button's live screen
  // location every time it opens, and re-synced on scroll/resize.
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

  // Close on outside click — must check BOTH the button and the portaled
  // dropdown, since the dropdown no longer lives inside the same DOM
  // subtree as the button.
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

  // Resolve the actual scroll-area DOM node at click time rather than
  // trusting scrollAreaRef.current to already be populated — App.jsx syncs
  // that ref via a separate effect, and depending on render timing it can
  // still be null the moment this button is clicked. Falling back to a
  // live querySelector makes this self-healing regardless of prop-wiring
  // or effect-ordering issues.
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

  async function handlePNG() {
    const el = ensureScrollAreaReady();
    if (!el) return;
    const list = resolveScopeTrainList();
    await withScopeApplied(list, () => exportGraphAsPNG(el, 'railway-chart.png'));
    setOpen(false);
  }
  async function handlePDF() {
    const el = ensureScrollAreaReady();
    if (!el) return;
    const list = resolveScopeTrainList();
    await withScopeApplied(list, () => exportGraphAsPDF(el, 'railway-chart.pdf'));
    setOpen(false);
  }
  function handleCSV() {
    const list = resolveScopeTrainList();
    exportTrainsAsCSV(list, `${scope}-trains-schedule.csv`);
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
          <button disabled={scopeCount === 0} onClick={handlePDF}>
            <FileText size={14} /> Download graph as PDF
          </button>
          <button disabled={scopeCount === 0} onClick={handleCSV}>
            <Table size={14} /> Download schedule as CSV
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}