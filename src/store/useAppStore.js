import { useMemo } from 'react';
import { create } from 'zustand';
import { parseRouteFile } from '../services/fileParser/routeParser';
import { parseScheduleFile } from '../services/fileParser/scheduleParser';
import { readRawTable } from '../services/fileParser/rawTableReader';
import { normalizeAgainstRoute } from '../services/fileParser/normalize';
import {
  formatClock,
  recomputeStopDays,
  parseClock,
  clockToMinutes,
  absoluteToClock,
  MINUTES_PER_DAY,
  dayIndexToWeekdayIndex,
} from '../utils/time/time';
import {
  SEP,
  stampStopUids,
  validateEditedTrains,
  finalizeEditedTrains,
  keysFromIssues,
} from '../utils/graph/saveEngine';
import { trainSignature } from '../utils/graph/pathDiff';

const initialFileState = () => ({ file: null, status: 'empty', issues: [] });

const stopKey = (trainNumber, stationCode) => `${trainNumber}${SEP}${stationCode}`;
const trainOfKey = (key) => key.split(SEP)[0];
const trainNumbersFromKeys = (keys) => new Set(Array.from(keys, trainOfKey));

export const MIN_ZOOM = 0.10;
export const MAX_ZOOM = 5.00;
export const ZOOM_STEP = 0.05;
export const AUTO_VISIBLE_TRAIN_LIMIT = 40;
const MAX_HISTORY_PER_TRAIN = 10;

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

const NOT_EDITING = { ok: false, error: 'The schedule is in View Mode. Right-click a train and choose "Edit train" to make changes.' };

const freshEditSession = () => ({
  isEditMode: false,
  editingTrainNumber: null, // the ONE train that is open for editing (right-click -> Edit train)
  isDirty: false,
  editHistory: [],
  editedStopKeys: new Set(),
  editedTrainNumbers: new Set(),
  editedKeyHistory: [],
  lastEditedKey: null,
  draftTouched: {},
  preEditHaltKeys: null,
  saveError: null,
  saveErrorKeys: new Set(),
  locateTarget: null,
});

function markTouched(touched, uid, ...fields) {
  if (!uid) return touched;
  const next = { ...(touched[uid] || {}) };
  fields.forEach((f) => { next[f] = true; });
  return { ...touched, [uid]: next };
}

function clearErrorKeysFor(keys, trainNumber, stationCodes) {
  if (keys.size === 0) return keys;
  const prefixes = stationCodes.filter(Boolean).map((c) => `${trainNumber}${SEP}${c}${SEP}`);
  const next = new Set();
  let changed = false;
  keys.forEach((k) => {
    if (prefixes.some((p) => k.startsWith(p))) changed = true;
    else next.add(k);
  });
  return changed ? next : keys;
}

/** Writes one event (arrival or departure) from an absolute-minute value. */
function setEvent(stop, kind, abs) {
  const a = Math.max(0, Math.round(abs));
  const c = absoluteToClock(a);
  const clock = { hh: c.hh, mm: c.mm };
  const raw = formatClock(clock);
  return kind === 'arrival'
    ? { ...stop, arrivalRaw: raw, arrivalClock: clock, arrivalDay: c.day, arrivalAbs: a }
    : { ...stop, departureRaw: raw, departureClock: clock, departureDay: c.day, departureAbs: a };
}

const HALT_FOLLOW_GAP = 1; // min

/** Is stop ke aas-paas ke events: ye stop inke beech hi rahega. */
function neighborBounds(stops, idx) {
  let lo = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const v = stops[i].departureAbs ?? stops[i].arrivalAbs;
    if (v != null) { lo = v; break; }
  }
  let hi = Infinity;
  for (let i = idx + 1; i < stops.length; i++) {
    const v = stops[i].arrivalAbs ?? stops[i].departureAbs;
    if (v != null) { hi = v; break; }
  }
  return { lo, hi };
}

function movePair(stop, kind, targetAbs, { single, clamp, linked, lo, hi }) {
  const arr = stop.arrivalAbs;
  const dep = stop.departureAbs;

  if (arr == null || dep == null) {
    const t = Math.max(lo, Math.min(hi, targetAbs));
    return { next: setEvent(stop, kind, t), moved: [kind] };
  }

  let a = arr;
  let d = dep;

  if (linked && !single) {
    // non-stop: red ko pakdo to dono saath move
    const len = d - a;
    a = Math.max(lo, Math.min(targetAbs, hi - len));
    d = a + len;
  } else if (kind === 'arrival') {
    a = Math.max(lo, targetAbs);
    if (single) {
      if (clamp) a = Math.min(a, d);
    } else if (a > d) {
      d = a + HALT_FOLLOW_GAP; // red aage nikla -> green 1 min aage
      if (d > hi) { d = hi; a = Math.min(a, d); }
    }
  } else {
    d = Math.min(hi, targetAbs);
    if (single) {
      if (clamp) d = Math.max(d, a);
    } else if (d < a) {
      a = d - HALT_FOLLOW_GAP; // green peeche gaya -> red 1 min peeche
      if (a < lo) { a = lo; d = Math.max(d, a); }
    }
  }

  const moved = [];
  let next = stop;
  if (a !== arr) { next = setEvent(next, 'arrival', a); moved.push('arrival'); }
  if (d !== dep) { next = setEvent(next, 'departure', d); moved.push('departure'); }
  return { next, moved };
}

function rebindDistances(trains, stations) {
  const byCode = new Map(stations.map((s) => [s.stationCode, s.distance]));
  return trains.map((t) => ({
    ...t,
    stops: t.stops.map((st) => (byCode.has(st.stationCode) ? { ...st, distance: byCode.get(st.stationCode) } : st)),
  }));
}

function withDraftTime(stop, kind, clock, raw) {
  const day =
    (kind === 'arrival' ? stop.arrivalDay : stop.departureDay) ??
    stop.arrivalDay ??
    stop.departureDay ??
    0;
  const abs = day * MINUTES_PER_DAY + clockToMinutes(clock);
  return kind === 'arrival'
    ? { ...stop, arrivalRaw: raw, arrivalClock: clock, arrivalDay: day, arrivalAbs: abs }
    : { ...stop, departureRaw: raw, departureClock: clock, departureDay: day, departureAbs: abs };
}

/** One-item-at-a-time rule: only one train (or the route distances) may hold unsaved edits. */
function editLockError(s, { trainNumber = null, route = false }) {
  const editingRoute = s.editHistory.some((h) => h.type === 'station-distance');
  const lockedTrain = s.editedTrainNumbers.size > 0 ? Array.from(s.editedTrainNumbers)[0] : null;
  if (route) {
    if (lockedTrain) return `Train ${lockedTrain} has unsaved changes. Save or cancel them before editing the route.`;
    return null;
  }
  if (editingRoute) return 'A route distance change is pending. Save or undo it before editing a train.';
  if (s.editingTrainNumber && s.editingTrainNumber !== trainNumber) {
    return `Train ${s.editingTrainNumber} is open for editing. Save or cancel it before editing train ${trainNumber}.`;
  }
  if (lockedTrain && lockedTrain !== trainNumber) {
    return `Train ${lockedTrain} has unsaved changes. Save or cancel them before editing train ${trainNumber}.`;
  }
  return null;
}

function buildEditPatch(s, { trains, type, trainNumber, stationCode, oldStationCode, touched }) {
  const key = stopKey(trainNumber, stationCode);
  const editedStopKeys = new Set(s.editedStopKeys);
  editedStopKeys.add(key);
  if (oldStationCode && oldStationCode !== stationCode) editedStopKeys.delete(stopKey(trainNumber, oldStationCode));
  return {
    trains,
    isDirty: true,
    draftTouched: touched,
    editHistory: [...s.editHistory, { type, prev: s.trains, prevTouched: s.draftTouched }],
    editedStopKeys,
    editedTrainNumbers: trainNumbersFromKeys(editedStopKeys),
    editedKeyHistory: [...s.editedKeyHistory, key],
    lastEditedKey: key,
    saveErrorKeys: clearErrorKeysFor(s.saveErrorKeys, trainNumber, [stationCode, oldStationCode]),
  };
}

function findTrainStop(get, trainNumber, stationCode) {
  const train = get().trains.find((t) => t.trainNumber === trainNumber);
  if (!train) return { error: { ok: false, error: 'Train not found.' } };
  const stop = train.stops.find((st) => st.stationCode === stationCode);
  if (!stop) return { error: { ok: false, error: 'Station not found in this train.' } };
  return { train, stop };
}

export const useAppStore = create((set, get) => ({
  theme: 'dark',
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  routeFileState: initialFileState(),
  scheduleFileState: initialFileState(),

  // Raw rows of the uploaded schedule file (+ the trains as first parsed). Used to download a
  // schedule file in the exact uploaded format with previous / current timings.
  scheduleSource: null,

  stations: [],
  trains: [],
  issues: [],

  baselineStations: [],
  baselineTrains: [],

  ...freshEditSession(),
  lastUpdatedTrainNumber: null,
  haltEnabledKeys: new Set(),

  // trainNumber -> [{ savedAt, train }]  (previous versions, oldest first)
  pathHistory: {},
  showPreviousPaths: true,
  togglePreviousPaths: () => set((s) => ({ showPreviousPaths: !s.showPreviousPaths })),

  // when on, dragging a point moves only that point (lets you shorten / lengthen a halt)
  singleSideMode: false,
  setSingleSideMode: (on) => set({ singleSideMode: on }),

  selectedTrainNumbers: null,
  searchQuery: '',
  hoveredTrainNumber: null,
  focusedTrainNumber: null,
  zoom: 1,
  tooltip: null,
  confirmDialog: null,
  isFilterDrawerOpen: false,
  isDetailsPanelOpen: true,
  isSidebarOpen: true,

  isExportRendering: false,
  setExportRendering: (v) => set({ isExportRendering: v }),

  autoLimitedTrainCount: null,

  scheduleStartDate: null,
  setScheduleStartDate: (dateStr) => set({ scheduleStartDate: dateStr || null }),

  autoViewDensity: true,
  setAutoViewDensity: (on) => set({ autoViewDensity: on }),

  viewMode: 'day-wise',
  setViewMode: (mode) => set({ viewMode: mode }),

  dayFilter: null,
  setAllDaysFilter: () => set({ dayFilter: null }),
  toggleDayIndexFilter: (dayIndex, dayCount) =>
    set((s) => {
      const base = s.dayFilter ?? new Set(Array.from({ length: dayCount }, (_, i) => i));
      const next = new Set(base);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      if (next.size === dayCount) return { dayFilter: null };
      return { dayFilter: next };
    }),

  toggleWeekdayGroupFilter: (weekdayIndex, dayCount) =>
    set((s) => {
      const groupDays = [];
      for (let d = 0; d < dayCount; d++) {
        if (dayIndexToWeekdayIndex(d) === weekdayIndex) groupDays.push(d);
      }
      const base = s.dayFilter ?? new Set(Array.from({ length: dayCount }, (_, i) => i));
      const next = new Set(base);
      const allSelected = groupDays.every((d) => next.has(d));
      if (allSelected) groupDays.forEach((d) => next.delete(d));
      else groupDays.forEach((d) => next.add(d));
      if (next.size === dayCount) return { dayFilter: null };
      return { dayFilter: next };
    }),

  // ---- station selection / filter ----
  selectedStationCode: null,
  stationLocateNonce: 0,
  stationFilter: null, // when set, only trains stopping at this station are drawn
  setSelectedStation: (code, { scroll = true } = {}) =>
    set((s) => ({
      selectedStationCode: code || null,
      stationFilter: s.stationFilter ? (code || null) : s.stationFilter,
      stationLocateNonce: scroll && code ? Date.now() : s.stationLocateNonce,
    })),
  setStationFilter: (code) => set({ stationFilter: code || null }),
  clearStationFilter: () => set({ stationFilter: null }),

  async loadRouteFile(file) {
    set({
      ...freshEditSession(),
      selectedStationCode: null,
      stationFilter: null,
      routeFileState: { file, status: 'loading', issues: [] },
    });
    try {
      const { stations, issues } = await parseRouteFile(file);
      const hasBlockingError = issues.some((i) => i.level === 'error') && stations.length === 0;
      set({
        routeFileState: { file, status: hasBlockingError ? 'error' : 'success', issues },
        stations,
        pathHistory: {},
      });
      get().revalidate();
      if (!get().isDirty) set({ baselineStations: get().stations, baselineTrains: get().trains });
    } catch (err) {
      set({ routeFileState: { file, status: 'error', issues: [{ level: 'error', message: err.message, source: 'route' }] } });
    }
  },

  async loadScheduleFile(file) {
    set({
      ...freshEditSession(),
      lastUpdatedTrainNumber: null,
      scheduleSource: null,
      scheduleFileState: { file, status: 'loading', issues: [] },
    });
    try {
      const { trains, issues } = await parseScheduleFile(file);
      const hasBlockingError = issues.some((i) => i.level === 'error') && trains.length === 0;

      // keep the raw rows so the edited schedule can be downloaded in the SAME format
      let rawRows = null;
      try { rawRows = await readRawTable(file); } catch { rawRows = null; }
      const ext = (file.name.split('.').pop() || '').toLowerCase();

      set({
        scheduleFileState: { file, status: hasBlockingError ? 'error' : 'success', issues },
        trains,
        pathHistory: {},
        scheduleSource: rawRows ? { fileName: file.name, ext, rows: rawRows, originalTrains: trains } : null,
      });
      get().revalidate();
      if (!get().isDirty) set({ baselineStations: get().stations, baselineTrains: get().trains });

      if (trains.length > AUTO_VISIBLE_TRAIN_LIMIT && get().selectedTrainNumbers == null) {
        const firstBatch = trains.slice(0, AUTO_VISIBLE_TRAIN_LIMIT).map((t) => t.trainNumber);
        set({ selectedTrainNumbers: firstBatch, autoLimitedTrainCount: trains.length });
      }
    } catch (err) {
      set({ scheduleFileState: { file, status: 'error', issues: [{ level: 'error', message: err.message, source: 'schedule' }] } });
    }
  },

  revalidate() {
    const { stations, trains, routeFileState, scheduleFileState } = get();
    if (stations.length === 0 || trains.length === 0) {
      set({ issues: [...routeFileState.issues, ...scheduleFileState.issues] });
      return;
    }
    const { trains: resolvedTrains, issues: crossIssues } = normalizeAgainstRoute(stations, trains);
    set({
      trains: resolvedTrains,
      issues: [...routeFileState.issues, ...scheduleFileState.issues, ...crossIssues],
    });
  },

  /** Cross on the Route file card: removes ONLY the route file. */
  clearRouteFile() {
    const { scheduleFileState } = get();
    set({
      ...freshEditSession(),
      routeFileState: initialFileState(),
      stations: [],
      baselineStations: [],
      selectedStationCode: null,
      stationFilter: null,
      pathHistory: {},
      issues: [...scheduleFileState.issues],
    });
  },

  /** Cross on the Schedule file card: removes ONLY the schedule file. */
  clearScheduleFile() {
    const { routeFileState } = get();
    set({
      ...freshEditSession(),
      scheduleFileState: initialFileState(),
      scheduleSource: null,
      trains: [],
      baselineTrains: [],
      selectedTrainNumbers: null,
      focusedTrainNumber: null,
      hoveredTrainNumber: null,
      pathHistory: {},
      lastUpdatedTrainNumber: null,
      autoLimitedTrainCount: null,
      haltEnabledKeys: new Set(),
      issues: [...routeFileState.issues],
    });
  },

  clearAll() {
    set({
      ...freshEditSession(),
      routeFileState: initialFileState(),
      scheduleFileState: initialFileState(),
      scheduleSource: null,
      stations: [],
      trains: [],
      issues: [],
      selectedTrainNumbers: null,
      focusedTrainNumber: null,
      selectedStationCode: null,
      stationFilter: null,
      baselineStations: [],
      baselineTrains: [],
      pathHistory: {},
      lastUpdatedTrainNumber: null,
      autoLimitedTrainCount: null,
      haltEnabledKeys: new Set(),
    });
  },

  // ---- train selection ----
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleTrainSelected: (trainNumber) =>
    set((s) => {
      const all = s.trains.map((t) => t.trainNumber);
      const current = s.selectedTrainNumbers ?? all;
      const next = current.includes(trainNumber)
        ? current.filter((n) => n !== trainNumber)
        : [...current, trainNumber];
      return { selectedTrainNumbers: next, autoLimitedTrainCount: null };
    }),
  showAllTrains: () => set({ selectedTrainNumbers: null, autoLimitedTrainCount: null }),
  hideAllTrains: () => set({ selectedTrainNumbers: [], autoLimitedTrainCount: null }),
  showOnlyTrains: (trainNumbers) => set({ selectedTrainNumbers: [...trainNumbers], autoLimitedTrainCount: null }),
  setFocusedTrain: (trainNumber) => set({ focusedTrainNumber: trainNumber }),

  setHoveredTrain: (trainNumber) => set({ hoveredTrainNumber: trainNumber }),
  showTooltip: (tooltip) => set({ tooltip }),
  hideTooltip: () => set({ tooltip: null }),

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom + ZOOM_STEP) })),
  zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom - ZOOM_STEP) })),
  resetZoom: () => set({ zoom: 1 }),

  requestConfirm: (dialog) => set({ confirmDialog: dialog }),
  cancelConfirm: () => set({ confirmDialog: null }),
  confirmAndRun: (value) => {
    const dialog = get().confirmDialog;
    if (dialog?.onConfirm) dialog.onConfirm(value);
    set({ confirmDialog: null });
  },

  // =====================================================================
  //  EDIT / SAVE WORKFLOW
  // =====================================================================

  /** Returns an error message if this train may not be edited right now, otherwise null. */
  getEditLockError: (trainNumber) => editLockError(get(), { trainNumber }),

  getStopBounds: (trainNumber, stationCode) => {
    const train = get().trains.find((t) => t.trainNumber === trainNumber);
    const idx = train ? train.stops.findIndex((st) => st.stationCode === stationCode) : -1;
    return idx < 0 ? { lo: 0, hi: Infinity } : neighborBounds(train.stops, idx);
  },

  /** Core move: targetAbs = day*1440 + minutes. Drag aur typed edit dono yahi use karte hain. */
  moveStopTo: (trainNumber, stationCode, kind, targetAbs, { single = false, clamp = false, linked = false, bound = false } = {}) => {
    const s0 = get();
    if (!s0.isEditMode) return NOT_EDITING;
    const lock = editLockError(s0, { trainNumber });
    if (lock) return { ok: false, error: lock };

    const train = s0.trains.find((t) => t.trainNumber === trainNumber);
    if (!train) return { ok: false, error: 'Train not found.' };
    const idx = train.stops.findIndex((st) => st.stationCode === stationCode);
    if (idx < 0) return { ok: false, error: 'Station not found in this train.' };

    const target = train.stops[idx];
    const { lo, hi } = bound ? neighborBounds(train.stops, idx) : { lo: 0, hi: Infinity };
    const { next, moved } = movePair(target, kind, Math.round(targetAbs), { single, clamp, linked, lo, hi });
    if (moved.length === 0) return { ok: true };

    set((s) => {
      const trains = s.trains.map((t) => {
        if (t.trainNumber !== trainNumber) return t;
        const stops = t.stops.map((st) => (st.stationCode === stationCode ? next : st));
        const maxDay = stops.reduce((m, st) => Math.max(m, st.arrivalDay ?? 0, st.departureDay ?? 0), 0);
        return { ...t, stops, maxDay };
      });
      return buildEditPatch(s, {
        trains, type: 'stop-time', trainNumber, stationCode,
        touched: markTouched(s.draftTouched, target.uid, ...moved),
      });
    });
    return { ok: true };
  },

  /** Typed time edit (details panel). */
  editStopTime: (trainNumber, stationCode, field, rawValue, opts = {}) => {
    const clock = parseClock(rawValue);
    if (!clock) return { ok: false, error: 'Invalid time format. Use HH:MM.' };
    const { stop, error } = findTrainStop(get, trainNumber, stationCode);
    if (error) return error;
    const kind = field === 'arrivalRaw' ? 'arrival' : 'departure';
    const day = stop[`${kind}Day`] ?? stop.arrivalDay ?? stop.departureDay ?? 0;
    return get().moveStopTo(trainNumber, stationCode, kind, day * MINUTES_PER_DAY + clockToMinutes(clock), opts);
  },

  /** Double-click: stoppage -> non-stoppage (departure = arrival). */
  makeNonStop: (trainNumber, stationCode) => {
    const s0 = get();
    if (!s0.isEditMode) return NOT_EDITING;
    const lock = editLockError(s0, { trainNumber });
    if (lock) return { ok: false, error: lock };
    const { stop, error } = findTrainStop(get, trainNumber, stationCode);
    if (error) return error;
    if (stop.arrivalAbs == null || stop.departureAbs == null) return { ok: false, error: 'This stop has only one time.' };
    if (stop.arrivalAbs === stop.departureAbs) return { ok: true };
    const next = setEvent(stop, 'departure', stop.arrivalAbs);
    set((s) => {
      const trains = s.trains.map((t) =>
        t.trainNumber !== trainNumber ? t : { ...t, stops: t.stops.map((st) => (st.stationCode === stationCode ? next : st)) }
      );
      return buildEditPatch(s, {
        trains, type: 'stop-time', trainNumber, stationCode,
        touched: markTouched(s.draftTouched, stop.uid, 'departure'),
      });
    });
    return { ok: true };
  },

  /**
   * Opens ONE train for editing (right-click on a train -> "Edit train").
   * Only a single train can be in edit mode at a time. Switching to another train is only
   * possible once the current one has no unsaved changes.
   */
  enterEditMode: (trainNumber) => {
    const s = get();
    if (!trainNumber) return { ok: false, error: 'Right-click a train on the graph to edit it.' };
    if (!s.trains.some((t) => t.trainNumber === trainNumber)) return { ok: false, error: 'Train not found.' };

    if (s.isEditMode) {
      if (s.editingTrainNumber === trainNumber) return { ok: true };
      if (s.isDirty) {
        return {
          ok: false,
          error: `Train ${s.editingTrainNumber ?? ''} has unsaved changes. Save or cancel them before editing train ${trainNumber}.`,
        };
      }
    }

    const trains = stampStopUids(s.trains);
    set({
      ...freshEditSession(),
      isEditMode: true,
      editingTrainNumber: trainNumber,
      trains,
      baselineTrains: trains,
      baselineStations: s.stations,
      preEditHaltKeys: s.isEditMode && s.preEditHaltKeys ? s.preEditHaltKeys : new Set(s.haltEnabledKeys),
      focusedTrainNumber: trainNumber,
    });
    return { ok: true };
  },

  requestCancelEdit: () => {
    const s = get();
    if (!s.isEditMode) return;
    if (!s.isDirty) {
      get().discardEdits();
      return;
    }
    s.requestConfirm({
      title: 'Discard changes?',
      message: 'All unsaved edits will be lost and the schedule will return to its last saved state.',
      confirmLabel: 'Discard',
      onConfirm: () => get().discardEdits(),
    });
  },

  discardEdits: () =>
    set((s) => ({
      ...freshEditSession(),
      stations: s.baselineStations,
      trains: s.baselineTrains,
      haltEnabledKeys: s.preEditHaltKeys ?? s.haltEnabledKeys,
    })),

  dismissSaveError: () => set({ saveError: null }),

  locateIssue: (issue) =>
    set({
      focusedTrainNumber: issue.trainNumber,
      locateTarget: {
        trainNumber: issue.trainNumber,
        stationCode: issue.stationCode,
        day: issue.day,
        minutes: issue.minutes,
        nonce: Date.now(),
      },
    }),

  /**
   * SAVE: validate the draft, then commit. On success the pre-edit version of every
   * changed train is pushed into pathHistory so it can be compared with the new path.
   */
  saveEdits: () => {
    const s = get();
    if (!s.isEditMode) return { ok: false };

    const issues = validateEditedTrains({
      trains: s.trains,
      touched: s.draftTouched,
      adjusted: new Map(),
      stations: s.stations,
    });

    if (issues.length > 0) {
      const first = issues[0];
      set({
        saveError: { issues },
        saveErrorKeys: keysFromIssues(issues),
        focusedTrainNumber: first.trainNumber,
        isDetailsPanelOpen: true,
        locateTarget: {
          trainNumber: first.trainNumber,
          stationCode: first.stationCode,
          day: first.day,
          minutes: first.minutes,
          nonce: Date.now(),
        },
      });
      return { ok: false, issues };
    }

    const finalTrains = finalizeEditedTrains(s.trains, s.draftTouched);
    const lastTrain = s.lastEditedKey ? trainOfKey(s.lastEditedKey) : null;

    const baseByNumber = new Map(s.baselineTrains.map((t) => [t.trainNumber, t]));
    const pathHistory = { ...s.pathHistory };
    finalTrains.forEach((t) => {
      if (!s.editedTrainNumbers.has(t.trainNumber)) return;
      const prev = baseByNumber.get(t.trainNumber);
      if (!prev || trainSignature(prev) === trainSignature(t)) return;
      pathHistory[t.trainNumber] = [
        ...(pathHistory[t.trainNumber] || []),
        { savedAt: Date.now(), train: prev },
      ].slice(-MAX_HISTORY_PER_TRAIN);
    });

    set({
      ...freshEditSession(),
      trains: finalTrains,
      baselineTrains: finalTrains,
      baselineStations: s.stations,
      pathHistory,
      lastUpdatedTrainNumber: lastTrain ?? s.lastUpdatedTrainNumber,
    });
    get().revalidate();
    set({ baselineTrains: get().trains, baselineStations: get().stations });
    return { ok: true };
  },

  addMissingHaltTime: (trainNumber, stationCode) => {
    const s0 = get();
    if (!s0.isEditMode) return NOT_EDITING;
    const lock = editLockError(s0, { trainNumber });
    if (lock) return { ok: false, error: lock };

    const { stop, error } = findTrainStop(get, trainNumber, stationCode);
    if (error) return error;

    if (stop.arrivalClock && stop.departureClock) {
      return { ok: false, error: 'This stop already has both arrival and departure times.' };
    }
    if (!stop.arrivalClock && !stop.departureClock) {
      return { ok: false, error: 'This stop has no time to copy.' };
    }

    const sourceClock = stop.arrivalClock || stop.departureClock;
    const sourceRaw = formatClock(sourceClock);

    set((s) => {
      const trains = s.trains.map((t) => {
        if (t.trainNumber !== trainNumber) return t;
        const stops = t.stops.map((st) => {
          if (st.stationCode !== stationCode) return st;
          return {
            ...st,
            arrivalRaw: st.arrivalRaw || sourceRaw,
            departureRaw: st.departureRaw || sourceRaw,
            arrivalClock: st.arrivalClock || sourceClock,
            departureClock: st.departureClock || sourceClock,
          };
        });
        return { ...t, stops: recomputeStopDays(stops) };
      });
      return buildEditPatch(s, {
        trains,
        type: 'stop-time',
        trainNumber,
        stationCode,
        touched: markTouched(s.draftTouched, stop.uid, 'arrival', 'departure'),
      });
    });
    return { ok: true };
  },

  enableHaltAtStop: (trainNumber, stationCode) => {
    if (!get().isEditMode) return;
    set((s) => {
      const haltEnabledKeys = new Set(s.haltEnabledKeys);
      haltEnabledKeys.add(stopKey(trainNumber, stationCode));
      return { haltEnabledKeys };
    });
  },

  editStopStation: (trainNumber, oldStationCode, newStationCode, { replaceExisting = false } = {}) => {
    const s0 = get();
    if (!s0.isEditMode) return NOT_EDITING;
    if (oldStationCode === newStationCode) return { ok: true };
    const lock = editLockError(s0, { trainNumber });
    if (lock) return { ok: false, error: lock };

    const { trains, stations } = s0;
    const train = trains.find((t) => t.trainNumber === trainNumber);
    if (!train) return { ok: false, error: 'Train not found.' };
    const routeStation = stations.find((s) => s.stationCode === newStationCode);
    if (!routeStation) return { ok: false, error: `${newStationCode} is not on the route file — cannot move this stop there.` };
    const moving = train.stops.find((st) => st.stationCode === oldStationCode);
    if (!moving) return { ok: false, error: 'Station not found in this train.' };

    const hasExisting = train.stops.some((st) => st.stationCode === newStationCode);
    if (hasExisting && !replaceExisting) {
      return { ok: false, error: `Station ${newStationCode} already exists in this train.` };
    }

    set((s) => {
      const nextTrains = s.trains.map((t) => {
        if (t.trainNumber !== trainNumber) return t;
        let stops = t.stops;
        if (hasExisting) stops = stops.filter((st) => st.stationCode !== newStationCode);
        stops = stops.map((st) =>
          st.stationCode === oldStationCode
            ? { ...st, stationCode: newStationCode, distance: routeStation.distance }
            : st
        );
        return { ...t, stops };
      });
      return buildEditPatch(s, {
        trains: nextTrains,
        type: 'stop-station',
        trainNumber,
        stationCode: newStationCode,
        oldStationCode,
        touched: markTouched(s.draftTouched, moving.uid, 'station'),
      });
    });
    return { ok: true };
  },

  editStationDistance: (stationCode, newDistance) => {
    const s0 = get();
    if (!s0.isEditMode) return NOT_EDITING;
    const lock = editLockError(s0, { route: true });
    if (lock) return { ok: false, error: lock };

    const prevStations = s0.stations;
    const stations = prevStations.map((s) =>
      s.stationCode === stationCode ? { ...s, distance: newDistance } : s
    );
    set((s) => ({
      stations,
      trains: rebindDistances(s.trains, stations),
      isDirty: true,
      editHistory: [
        ...s.editHistory,
        { type: 'station-distance', prev: prevStations, prevTrains: s.trains, prevTouched: s.draftTouched },
      ],
    }));
    return { ok: true };
  },

  undoLastEdit: () => {
    set((s) => {
      if (!s.isEditMode || s.editHistory.length === 0) return {};
      const last = s.editHistory[s.editHistory.length - 1];
      const rest = s.editHistory.slice(0, -1);
      const base = {
        editHistory: rest,
        isDirty: rest.length > 0,
        draftTouched: last.prevTouched ?? s.draftTouched,
        saveError: null,
        saveErrorKeys: new Set(),
      };

      if (last.type === 'station-distance') {
        return { ...base, stations: last.prev, trains: last.prevTrains ?? s.trains };
      }

      const poppedKey = s.editedKeyHistory[s.editedKeyHistory.length - 1] ?? null;
      const editedKeyHistory = s.editedKeyHistory.slice(0, -1);
      let editedStopKeys = s.editedStopKeys;
      let editedTrainNumbers = s.editedTrainNumbers;
      if (poppedKey && !editedKeyHistory.includes(poppedKey)) {
        editedStopKeys = new Set(s.editedStopKeys);
        editedStopKeys.delete(poppedKey);
        editedTrainNumbers = trainNumbersFromKeys(editedStopKeys);
      }
      return {
        ...base,
        trains: last.prev,
        editedKeyHistory,
        editedStopKeys,
        editedTrainNumbers,
        lastEditedKey: editedKeyHistory[editedKeyHistory.length - 1] ?? null,
      };
    });
  },

  toggleFilterDrawer: () => set((s) => ({ isFilterDrawerOpen: !s.isFilterDrawerOpen })),
  toggleDetailsPanel: () => set((s) => ({ isDetailsPanelOpen: !s.isDetailsPanelOpen })),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
}));

export function isStopEdited(state, trainNumber, stationCode) {
  return state.editedStopKeys.has(stopKey(trainNumber, stationCode));
}
export function isLastEditedStop(state, trainNumber, stationCode) {
  return state.lastEditedKey === stopKey(trainNumber, stationCode);
}
export function isHaltEnabled(state, trainNumber, stationCode) {
  return state.haltEnabledKeys.has(stopKey(trainNumber, stationCode));
}

/** The version of a train's path to compare against: pre-edit baseline while editing, else last saved version. */
export function getPreviousTrain(state, trainNumber) {
  if (state.isEditMode && state.editedTrainNumbers.has(trainNumber)) {
    return state.baselineTrains.find((t) => t.trainNumber === trainNumber) ?? null;
  }
  const h = state.pathHistory[trainNumber];
  return h && h.length ? h[h.length - 1].train : null;
}

/** Set of station codes the focused train calls at (null when no train is focused). */
export function useFocusedStationCodes() {
  const trains = useAppStore((s) => s.trains);
  const focused = useAppStore((s) => s.focusedTrainNumber);
  return useMemo(() => {
    if (!focused) return null;
    const t = trains.find((x) => x.trainNumber === focused);
    return t ? new Set(t.stops.map((st) => st.stationCode)) : null;
  }, [trains, focused]);
}

export function getVisibleTrains(state) {
  const { trains, selectedTrainNumbers, searchQuery } = state;
  let list = trains;
  if (selectedTrainNumbers != null) {
    const set = new Set(selectedTrainNumbers);
    list = list.filter((t) => set.has(t.trainNumber));
  }
  const q = searchQuery.trim().toLowerCase();
  if (q) list = list.filter((t) => trainMatchesQuery(t, q));
  return list;
}

export function filterTrainsByStation(trains, stationFilter) {
  if (!stationFilter) return trains;
  return trains.filter((t) => t.stops.some((s) => s.stationCode === stationFilter));
}

export function getScheduleDayCount(state) {
  if (state.trains.length === 0) return 1;
  let maxDay = 0;
  state.trains.forEach((t) => { maxDay = Math.max(maxDay, t.maxDay || 0); });
  return maxDay + 1;
}

function trainMatchesQuery(train, q) {
  if (train.trainNumber.toLowerCase().includes(q)) return true;
  return !!(train.trainName && train.trainName.toLowerCase().includes(q));
}

/** Station search by code or name; exact/prefix code matches first. */
export function findMatchingStations(stations, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (s) => {
    const c = s.stationCode.toLowerCase();
    const n = (s.stationName || '').toLowerCase();
    if (c === q) return 0;
    if (c.startsWith(q)) return 1;
    if (n.startsWith(q)) return 2;
    return 3;
  };
  return stations
    .filter((s) => s.stationCode.toLowerCase().includes(q) || (s.stationName || '').toLowerCase().includes(q))
    .map((s) => ({ s, r: rank(s) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);
}

export function getTrainsAtStation(trains, stationCode) {
  const rows = [];
  trains.forEach((train) => {
    const stop = train.stops.find((s) => s.stationCode === stationCode);
    if (!stop) return;
    rows.push({ train, stop });
  });
  rows.sort((a, b) => {
    const aAbs = a.stop.arrivalAbs ?? a.stop.departureAbs ?? 0;
    const bAbs = b.stop.arrivalAbs ?? b.stop.departureAbs ?? 0;
    return aAbs - bAbs;
  });
  return rows;
}