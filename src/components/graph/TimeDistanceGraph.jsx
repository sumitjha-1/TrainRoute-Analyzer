import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  useAppStore,
  getVisibleTrains,
  filterTrainsByStation,
  getPreviousTrain,
} from '../../store/useAppStore';
import {
  buildDistanceScale,
  xToMinutes,
  minutesToX,
  panelWidth,
  STATION_LABEL_COL_WIDTH,
  DAY_PANEL_HEADER_HEIGHT,
  VIRTUALIZATION_BUFFER_PX,
} from '../../utils/graph/coordinates';
import { buildTrainDaySegments } from '../../utils/graph/pathBuilder';
import {
  dayIndexToWeekdayIndex,
  WEEKDAY_NAMES,
} from '../../utils/time/time';
import { StationAxis } from './StationAxis';
import { DayPanel } from './DayPanel';
import { DayBoundary } from './DayBoundary';
import { GraphTooltip } from './GraphTooltip';
import { TrainContextMenu } from './TrainContextMenu';
import { formatTooltip } from './DayPanelGrid';
import { EmptyState } from '../common/EmptyState';
import { TrainFront } from 'lucide-react';
import './Graph.css';

const LAYER_DASH_PATTERNS = ['none', '8 4', '2 3', '10 3 2 3', '1 4', '4 2 1 2', '12 3'];

function dayHasVisibleContent(trainEntries) {
  const hasPoint = (segs) => !!segs && segs.some((seg) => seg.from.point || seg.to.point);
  return trainEntries.some(({ segments, prevSegments }) => hasPoint(segments) || hasPoint(prevSegments));
}

const concatNullable = (a, b) => (a && b ? a.concat(b) : a || b || null);

export function TimeDistanceGraph() {
  const stations = useAppStore((s) => s.stations);
  const zoom = useAppStore((s) => s.zoom);
  const trains = useAppStore((s) => s.trains);
  const selectedTrainNumbers = useAppStore((s) => s.selectedTrainNumbers);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const moveStopTo = useAppStore((s) => s.moveStopTo);
  const makeNonStop = useAppStore((s) => s.makeNonStop);
  const enterEditMode = useAppStore((s) => s.enterEditMode);
  const saveEdits = useAppStore((s) => s.saveEdits);
  const requestCancelEdit = useAppStore((s) => s.requestCancelEdit);
  const editingTrainNumber = useAppStore((s) => s.editingTrainNumber);
  const setHoveredTrain = useAppStore((s) => s.setHoveredTrain);
  const setFocusedTrain = useAppStore((s) => s.setFocusedTrain);
  const focusedTrainNumber = useAppStore((s) => s.focusedTrainNumber);
  const showTooltip = useAppStore((s) => s.showTooltip);
  const hideTooltip = useAppStore((s) => s.hideTooltip);
  const viewMode = useAppStore((s) => s.viewMode);
  const dayFilter = useAppStore((s) => s.dayFilter);
  const stationFilter = useAppStore((s) => s.stationFilter);

  const isExportRendering = useAppStore((s) => s.isExportRendering);
  const locateTarget = useAppStore((s) => s.locateTarget);
  const stationLocateNonce = useAppStore((s) => s.stationLocateNonce);

  const baselineTrains = useAppStore((s) => s.baselineTrains);
  const pathHistory = useAppStore((s) => s.pathHistory);
  const isEditMode = useAppStore((s) => s.isEditMode);
  const editedTrainNumbers = useAppStore((s) => s.editedTrainNumbers);
  const showPreviousPaths = useAppStore((s) => s.showPreviousPaths);

  const showErrorDialog = useCallback((message) => {
    requestConfirm({
      title: 'Cannot edit',
      message,
      confirmLabel: 'OK',
      onConfirm: () => {},
    });
  }, [requestConfirm]);

  const visibleTrains = useMemo(
    () => getVisibleTrains({ trains, selectedTrainNumbers, searchQuery }),
    [trains, selectedTrainNumbers, searchQuery]
  );

  const scopedTrains = useMemo(
    () => filterTrainsByStation(visibleTrains, stationFilter),
    [visibleTrains, stationFilter]
  );

  // Previous path is drawn for EVERY train that has one: the train being edited right now
  // (its pre-edit version) and every train that was edited & saved earlier (its last saved version).
  // The History button in the toolbar switches all of them on/off.
  const previousByTrain = useMemo(() => {
    const map = new Map();
    if (!showPreviousPaths) return map;
    const state = { isEditMode, editedTrainNumbers, baselineTrains, pathHistory };
    scopedTrains.forEach((t) => {
      const prev = getPreviousTrain(state, t.trainNumber);
      if (prev && prev !== t) map.set(t.trainNumber, prev);
    });
    return map;
  }, [scopedTrains, showPreviousPaths, isEditMode, editedTrainNumbers, baselineTrains, pathHistory]);

  const containerRef = useRef(null);
  const scrollElRef = useRef(null);
  const justDraggedRef = useRef(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [trainMenu, setTrainMenu] = useState(null);
  const rafRef = useRef(null);

  const viewportWidth = scrollPos.width || containerSize.width;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (containerRef.current) {
        setContainerSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const syncScrollPos = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) return;
    setScrollPos({
      left: el.scrollLeft,
      top: el.scrollTop,
      width: el.clientWidth,
      height: el.clientHeight,
    });
  }, []);

  useEffect(() => {
    syncScrollPos();
  }, [syncScrollPos, containerSize.width, containerSize.height]);

  const scale = useMemo(() => {
    const availableGraphHeight = Math.max(
      0,
      (scrollPos.height || containerSize.height) - DAY_PANEL_HEADER_HEIGHT * 2
    );
    return buildDistanceScale(stations, zoom, availableGraphHeight);
  }, [stations, zoom, containerSize.height, scrollPos.height]);

  const { dayCount, byDayTrainSegments } = useMemo(() => {
    let maxDay = 0;
    const perTrain = scopedTrains.map((train) => {
      const { segmentsByDay, maxDay: trainMaxDay } = buildTrainDaySegments(train);
      const prevTrain = previousByTrain.get(train.trainNumber);
      const prev = prevTrain ? buildTrainDaySegments(prevTrain) : null;
      maxDay = Math.max(maxDay, trainMaxDay, prev ? prev.maxDay : 0);
      return { train, segmentsByDay, prevByDay: prev ? prev.segmentsByDay : null };
    });
    const days = [];
    for (let d = 0; d <= maxDay; d++) {
      days.push(
        perTrain
          .filter((pt) => pt.segmentsByDay.has(d) || (pt.prevByDay && pt.prevByDay.has(d)))
          .map((pt) => ({
            train: pt.train,
            segments: pt.segmentsByDay.get(d) || [],
            prevSegments: pt.prevByDay ? pt.prevByDay.get(d) || null : null,
          }))
      );
    }
    return { dayCount: maxDay + 1, byDayTrainSegments: days };
  }, [scopedTrains, previousByTrain]);

  const { panels, layerLegend } = useMemo(() => {
    const allowedDayIndices = [];
    for (let d = 0; d < dayCount; d++) {
      if (!dayFilter || dayFilter.has(d)) allowedDayIndices.push(d);
    }

    if (viewMode === 'weekly') {
      const byWeekday = new Map();
      allowedDayIndices.forEach((d) => {
        const wd = dayIndexToWeekdayIndex(d);
        const merged = byWeekday.get(wd) || new Map();
        byDayTrainSegments[d].forEach(({ train, segments, prevSegments }) => {
          const existing = merged.get(train.trainNumber);
          merged.set(train.trainNumber, {
            train,
            segments: existing ? existing.segments.concat(segments) : segments,
            prevSegments: existing ? concatNullable(existing.prevSegments, prevSegments) : prevSegments,
          });
        });
        byWeekday.set(wd, merged);
      });
      const p = [0, 1, 2, 3, 4, 5, 6]
        .filter((wd) => byWeekday.has(wd) && byWeekday.get(wd).size > 0)
        .filter((wd) => dayHasVisibleContent(Array.from(byWeekday.get(wd).values())))
        .map((wd) => ({
          id: `weekday-${wd}`,
          dayIndex: wd,
          label: WEEKDAY_NAMES[wd],
          segments: Array.from(byWeekday.get(wd).values()),
        }));
      return { panels: p, layerLegend: null };
    }

    if (viewMode === 'layered') {
      const merged = [];
      const legend = [];
      allowedDayIndices.forEach((d, pos) => {
        const dashPattern = LAYER_DASH_PATTERNS[pos % LAYER_DASH_PATTERNS.length];
        const opacity =
          allowedDayIndices.length <= 1 ? 1 : 0.55 + (0.45 * pos) / (allowedDayIndices.length - 1);
        legend.push({ dayIndex: d, label: `Day ${d + 1}`, dashPattern, opacity });
        byDayTrainSegments[d].forEach(({ train, segments, prevSegments }) => {
          merged.push({ train, segments, prevSegments, layerDay: d, layerOpacity: opacity, layerDashPattern: dashPattern });
        });
      });
      return {
        panels: [{ id: 'layered-all', dayIndex: 0, label: 'Layered Days', segments: merged }],
        layerLegend: legend,
      };
    }

    const p = allowedDayIndices
      .filter((d) => dayHasVisibleContent(byDayTrainSegments[d]))
      .map((d) => ({
        id: `day-${d}`,
        dayIndex: d,
        label: `Day ${d + 1}`,
        segments: byDayTrainSegments[d],
      }));
    return { panels: p, layerLegend: null };
  }, [viewMode, dayFilter, dayCount, byDayTrainSegments]);

  const naturalColumnWidth = panelWidth(zoom);
  const columnWidth = useMemo(() => {
    const count = panels.length || 1;
    const available = Math.max(0, viewportWidth - STATION_LABEL_COL_WIDTH * 2);
    const naturalTotal = naturalColumnWidth * count;
    if (naturalTotal > 0 && naturalTotal < available) return available / count;
    return naturalColumnWidth;
  }, [naturalColumnWidth, panels.length, viewportWidth]);

  const dayBoundaries = useMemo(() => {
    if (viewMode === 'layered' || panels.length < 2) return [];
    return panels.slice(0, -1).map((_, i) => STATION_LABEL_COL_WIDTH + (i + 1) * columnWidth);
  }, [viewMode, panels.length, columnWidth]);

  const totalDrawHeight = scale.height + DAY_PANEL_HEADER_HEIGHT * 2;

  const handleScroll = useCallback(() => {
    hideTooltip();
    setTrainMenu(null);
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncScrollPos();
    });
  }, [hideTooltip, syncScrollPos]);

  useEffect(() => {
    syncScrollPos();
  }, [syncScrollPos, containerSize.width, panels.length, zoom]);

  const visibleColumnRange = useMemo(() => {
    const count = panels.length;
    if (count === 0) return { start: 0, end: -1 };
    if (isExportRendering) return { start: 0, end: count - 1 };
    const contentLeft = scrollPos.left - VIRTUALIZATION_BUFFER_PX - STATION_LABEL_COL_WIDTH;
    const contentRight = scrollPos.left + viewportWidth + VIRTUALIZATION_BUFFER_PX - STATION_LABEL_COL_WIDTH;
    const startIdx = Math.max(0, Math.floor(contentLeft / columnWidth));
    const endIdx = Math.min(count - 1, Math.ceil(contentRight / columnWidth));
    return { start: startIdx, end: endIdx };
  }, [panels.length, scrollPos.left, viewportWidth, columnWidth, isExportRendering]);

  const columnVisibleMinutes = useCallback((columnPos) => {
    if (isExportRendering) return { minMinutes: 0, maxMinutes: 1440 };
    const colLeft = STATION_LABEL_COL_WIDTH + columnPos * columnWidth;
    const localLeft = Math.max(0, scrollPos.left - colLeft - VIRTUALIZATION_BUFFER_PX);
    const localRight = Math.min(columnWidth, scrollPos.left + viewportWidth - colLeft + VIRTUALIZATION_BUFFER_PX);
    return {
      minMinutes: xToMinutes(localLeft, zoom),
      maxMinutes: xToMinutes(localRight, zoom),
    };
  }, [columnWidth, scrollPos.left, viewportWidth, zoom, isExportRendering]);

  const handlePointHover = useCallback((e, { train, point }) => {
    const rect = containerRef.current.getBoundingClientRect();
    showTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      content: formatTooltip({ train, point }),
    });
    setHoveredTrain(train.trainNumber);
  }, [showTooltip, setHoveredTrain]);

  const handlePointLeave = useCallback(() => {
    hideTooltip();
    setHoveredTrain(null);
  }, [hideTooltip, setHoveredTrain]);

  const handleTrainClick = useCallback((trainNumber) => {
    if (justDraggedRef.current) return; // the click that ends a drag must not change selection
    setFocusedTrain(focusedTrainNumber === trainNumber ? null : trainNumber);
  }, [focusedTrainNumber, setFocusedTrain]);

  // right-click on a train path -> small menu (Edit train / Save / Cancel)
  const handleTrainContextMenu = useCallback((e, train) => {
    e.preventDefault();
    e.stopPropagation();
    hideTooltip();
    const rect = containerRef.current.getBoundingClientRect();
    setTrainMenu({
      trainNumber: train.trainNumber,
      x: Math.min(e.clientX - rect.left, Math.max(0, rect.width - 180)),
      y: Math.min(e.clientY - rect.top, Math.max(0, rect.height - 110)),
    });
  }, [hideTooltip]);

  const closeTrainMenu = useCallback(() => setTrainMenu(null), []);

  const handleMenuEdit = useCallback((trainNumber) => {
    const r = enterEditMode(trainNumber);
    if (r && !r.ok) showErrorDialog(r.error);
  }, [enterEditMode, showErrorDialog]);

  // scroll to a validation issue
  useEffect(() => {
    if (!locateTarget) return;
    const el = scrollElRef.current;
    if (!el) return;

    let idx = -1;
    if (viewMode === 'layered') idx = panels.length ? 0 : -1;
    else if (viewMode === 'weekly') idx = panels.findIndex((p) => p.dayIndex === dayIndexToWeekdayIndex(locateTarget.day));
    else idx = panels.findIndex((p) => p.dayIndex === locateTarget.day);
    if (idx < 0) return;

    const x = STATION_LABEL_COL_WIDTH + idx * naturalColumnWidth + minutesToX(locateTarget.minutes, zoom);
    const y = scale.toY(locateTarget.stationCode);
    el.scrollTo({
      left: Math.max(0, x - el.clientWidth / 2),
      top: y != null ? Math.max(0, y + DAY_PANEL_HEADER_HEIGHT - el.clientHeight / 2) : el.scrollTop,
      behavior: 'smooth',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateTarget?.nonce]);

  // scroll to a station chosen from the station search
  useEffect(() => {
    if (!stationLocateNonce) return;
    const el = scrollElRef.current;
    const code = useAppStore.getState().selectedStationCode;
    if (!el || !code) return;
    const y = scale.toY(code);
    if (y == null) return;
    el.scrollTo({
      top: Math.max(0, y + DAY_PANEL_HEADER_HEIGHT - el.clientHeight / 2),
      behavior: 'smooth',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationLocateNonce]);

  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  useEffect(() => { dragRef.current = dragState; }, [dragState]);

  const handlePointDragStart = useCallback((e, { train, point, dayIndex, svgEl }) => {
    const state = useAppStore.getState();
    if (!state.isEditMode) return;
    if (!svgEl || !point.clock) return;
    e.preventDefault();
    e.stopPropagation();
    hideTooltip();

    const lock = state.getEditLockError(train.trainNumber);
    if (lock) { showErrorDialog(lock); return; }
    state.setFocusedTrain(train.trainNumber);

    const field = point.kind === 'departure' ? 'departureRaw' : 'arrivalRaw';
    // No special "non-stop" handling: every red / green half-disc is dragged on its own.
    const linked = false;
    const rect = svgEl.getBoundingClientRect();
    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;
    const origMinutes = point.abs; // ab ABSOLUTE minutes (day*1440 + time)

    setDragState({
      sessionId: `${Date.now()}-${Math.random()}`,
      trainNumber: train.trainNumber,
      stationCode: point.stationCode,
      field,
      linked,
      single: e.shiftKey || state.singleSideMode,
      isSoleEvent: !!point.isSoleEvent,
      dayIndex,
      svgEl,
      origClock: point.clock,
      origMinutes,
      origDistance: point.distance,
      origX: x0,
      origY: y0,
      x: x0,
      y: y0,
      currentMinutes: origMinutes,
      candidateStationCode: point.stationCode,
      isStationDrag: false,
      isValid: true,
      invalidReason: null,
    });
  }, [hideTooltip, showErrorDialog]);

  const handleRequestHalt = useCallback(({ train, stationCode }) => {
    requestConfirm({
      title: 'Make this a non-stoppage?',
      message: `${train.trainNumber} halts at ${stationCode}. Arrival and departure will become the same time.`,
      confirmLabel: 'Yes',
      onConfirm: () => {
        const r = makeNonStop(train.trainNumber, stationCode);
        if (r && !r.ok) showErrorDialog(r.error);
      },
    });
  }, [requestConfirm, makeNonStop, showErrorDialog]);

  const finalizeDrag = useCallback((session) => {
    if (!session || session.currentMinutes === session.origMinutes) return;
    const kind = session.field === 'arrivalRaw' ? 'arrival' : 'departure';
    // Free movement: no clamping to neighbouring stations / own other side.
    // Anything illegal is reported by the validation that runs on Save.
    const result = moveStopTo(session.trainNumber, session.stationCode, kind, session.currentMinutes, {
      single: session.single,
      linked: session.linked,
      clamp: false,
      bound: false,
    });
    if (!result.ok) showErrorDialog(result.error);
  }, [moveStopTo, showErrorDialog]);

  useEffect(() => {
    if (!dragState) return;
    let pending = null;
    let moveRaf = null;

    function applyPendingMove() {
      moveRaf = null;
      const e = pending;
      const current = dragRef.current;
      if (!e || !current) return;
      const rect = current.svgEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const deltaMin = Math.round(xToMinutes(x - current.origX, zoom));
      const abs = Math.max(0, current.origMinutes + deltaMin); // free horizontal movement

      setDragState((prev) => prev && ({
        ...prev,
        x: prev.origX + minutesToX(abs - prev.origMinutes, zoom),
        y: prev.origY,
        currentMinutes: abs,
        single: e.shiftKey || useAppStore.getState().singleSideMode,
        candidateStationCode: prev.stationCode,
        isStationDrag: false,
      }));
    }

    function onMove(e) {
      pending = e;
      if (moveRaf == null) moveRaf = requestAnimationFrame(applyPendingMove);
    }

    function onUp() {
      if (moveRaf != null) { cancelAnimationFrame(moveRaf); moveRaf = null; }
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 60);
      finalizeDrag(dragRef.current);
      setDragState(null);
    }

    function onCancel() {
      if (moveRaf != null) { cancelAnimationFrame(moveRaf); moveRaf = null; }
      setDragState(null);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }

    document.body.classList.add('graph-dragging');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (moveRaf != null) cancelAnimationFrame(moveRaf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('graph-dragging');
    };
  }, [dragState?.sessionId, zoom, stations, scale, finalizeDrag]);

  // ─── Ctrl/⌘ + wheel (and trackpad pinch) → zoom around the cursor ───
  const zoomAnchorRef = useRef(null);
  const hasGraph = stations.length > 0 && scopedTrains.length > 0;

  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    function onWheel(e) {
      if (!(e.ctrlKey || e.metaKey)) return; // plain wheel = normal scroll
      e.preventDefault();
      const { zoom: z0, setZoom } = useAppStore.getState();
      setZoom(z0 * Math.exp(-e.deltaY * 0.0015));
      const z1 = useAppStore.getState().zoom;
      if (z1 === z0) return;
      const rect = el.getBoundingClientRect();
      zoomAnchorRef.current = {
        ratio: z1 / z0,
        cx: e.clientX - rect.left,
        cy: e.clientY - rect.top,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasGraph]);

  // after the zoom is rendered, keep the point under the cursor in place
  useLayoutEffect(() => {
    const a = zoomAnchorRef.current;
    const el = scrollElRef.current;
    if (!a || !el) return;
    zoomAnchorRef.current = null;
    el.scrollLeft = (a.left + a.cx) * a.ratio - a.cx;
    el.scrollTop = (a.top + a.cy) * a.ratio - a.cy;
  }, [zoom]);

  if (stations.length === 0 || scopedTrains.length === 0) {
    return (
      <div className="graph-empty-wrap">
        <EmptyState
          icon={<TrainFront size={26} />}
          title={stations.length === 0 ? 'Upload route & schedule files to begin' : 'No trains to display'}
          message={
            stations.length === 0
              ? 'Load a route file and a schedule file from the sidebar to generate the time-distance graph.'
              : 'All trains are hidden or filtered out. Use the train list or the station filter to show trains.'
          }
        />
      </div>
    );
  }

  return (
    <div className="graph-root" ref={containerRef}>
      {layerLegend && (
        <div className="graph-layer-legend">
          <span className="graph-layer-legend-title">Layers</span>
          {layerLegend.map((item) => (
            <span className="graph-layer-legend-item" key={item.dayIndex} style={{ opacity: 0.5 + item.opacity * 0.5 }}>
              <svg width="22" height="8" className="graph-layer-legend-swatch">
                <line
                  x1="1" y1="4" x2="21" y2="4"
                  stroke="var(--accent)"
                  strokeWidth="2.4"
                  strokeDasharray={item.dashPattern === 'none' ? undefined : item.dashPattern}
                  strokeLinecap="round"
                />
              </svg>
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div
        className="graph-scroll-area"
        ref={scrollElRef}
        onScroll={handleScroll}
      >
        <div className="graph-days-row">
          <div className="graph-station-axis-sticky graph-station-axis-sticky-left">
            <div className="graph-axis-spacer" style={{ height: DAY_PANEL_HEADER_HEIGHT }} />
            <StationAxis stations={stations} scale={scale} height={scale.height} side="left" />
            <div className="graph-axis-spacer" style={{ height: DAY_PANEL_HEADER_HEIGHT }} />
          </div>

          {panels.map((panel, idx) => {
            if (idx < visibleColumnRange.start || idx > visibleColumnRange.end) {
              return <div key={panel.id} className="graph-day-column-spacer" style={{ width: columnWidth }} aria-hidden="true" />;
            }
            return (
              <DayPanel
                key={panel.id}
                dayIndex={panel.dayIndex}
                label={panel.label}
                stations={stations}
                scale={scale}
                zoom={zoom}
                trainSegments={panel.segments}
                visibleMinutes={columnVisibleMinutes(idx)}
                onPointHover={handlePointHover}
                onPointLeave={handlePointLeave}
                onTrainClick={handleTrainClick}
                onTrainContextMenu={handleTrainContextMenu}
                onPointDragStart={handlePointDragStart}
                onRequestHalt={handleRequestHalt}
                dragState={dragState}
              />
            );
          })}

          <div className="graph-station-axis-sticky graph-station-axis-sticky-right">
            <div className="graph-axis-spacer" style={{ height: DAY_PANEL_HEADER_HEIGHT }} />
            <StationAxis stations={stations} scale={scale} height={scale.height} side="right" />
            <div className="graph-axis-spacer" style={{ height: DAY_PANEL_HEADER_HEIGHT }} />
          </div>

          {dayBoundaries.map((left, i) => (
            <DayBoundary key={`boundary-${i}`} left={left} height={totalDrawHeight} />
          ))}
        </div>
      </div>
      <GraphTooltip />
      <TrainContextMenu
        menu={trainMenu}
        onClose={closeTrainMenu}
        onEdit={handleMenuEdit}
        onSave={() => saveEdits()}
        onCancel={() => requestCancelEdit()}
        editingTrainNumber={editingTrainNumber}
      />
    </div>
  );
}