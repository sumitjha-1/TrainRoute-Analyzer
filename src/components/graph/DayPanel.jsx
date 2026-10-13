import { memo } from 'react';
import { DayPanelGrid } from './DayPanelGrid';
import { TimeHeader } from './TimeHeader';
import { panelWidth } from '../../utils/graph/coordinates';

/**
 * Renders ONE day (or weekday, or the single layered panel) as a single
 * column: time header, grid, time header. The "Day N" label is a small
 * floating badge overlaid in the top-left corner of the grid — NOT a
 * separate solid block taking up its own horizontal space — so the train
 * paths stay visually continuous across the day boundary instead of
 * appearing to break/disappear behind a bar. Columns are laid out
 * left-to-right by the parent (TimeDistanceGraph's `.graph-days-row`),
 * giving Day 1 -> Day 2 -> Day 3 side-by-side.
 */
function DayPanelInner({
  dayIndex,
  label,
  stations,
  scale,
  zoom,
  trainSegments,
  visibleMinutes,
  onPointHover,
  onPointLeave,
  onTrainClick,
  onPointDragStart,
  onRequestHalt,
  dragState,
}) {
  const width = panelWidth(zoom);
  const displayLabel = label || `Day ${dayIndex + 1}`;
  return (
    <div className="graph-day-column" style={{ width }}>
      <div className="graph-day-badge">{displayLabel}</div>
      <TimeHeader zoom={zoom} position="top" hideCorner />
      <DayPanelGrid
        dayIndex={dayIndex}
        width={width}
        height={scale.height}
        zoom={zoom}
        stations={stations}
        scale={scale}
        trainSegments={trainSegments}
        visibleMinutes={visibleMinutes}
        onPointHover={onPointHover}
        onPointLeave={onPointLeave}
        onTrainClick={onTrainClick}
        onPointDragStart={onPointDragStart}
        onRequestHalt={onRequestHalt}
        dragState={dragState}
      />
      <TimeHeader zoom={zoom} position="bottom" hideCorner />
    </div>
  );
}

// Helper to compare drag states without circular DOM elements
function isDragStateEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.sessionId === b.sessionId &&
    a.trainNumber === b.trainNumber &&
    a.stationCode === b.stationCode &&
    a.field === b.field &&
    a.dayIndex === b.dayIndex &&
    a.origClock === b.origClock &&
    a.origMinutes === b.origMinutes &&
    a.origDistance === b.origDistance &&
    a.origY === b.origY &&
    a.x === b.x &&
    a.y === b.y &&
    a.currentMinutes === b.currentMinutes &&
    a.candidateStationCode === b.candidateStationCode &&
    a.isStationDrag === b.isStationDrag &&
    a.isValid === b.isValid &&
    a.invalidReason === b.invalidReason
  );
}

function propsAreEqual(prev, next) {
  if (prev.dayIndex !== next.dayIndex) return false;
  if (prev.label !== next.label) return false;
  if (prev.stations !== next.stations) return false;
  if (prev.scale !== next.scale) return false;
  if (prev.zoom !== next.zoom) return false;
  if (prev.trainSegments !== next.trainSegments) return false;
  if (prev.onPointHover !== next.onPointHover) return false;
  if (prev.onPointLeave !== next.onPointLeave) return false;
  if (prev.onTrainClick !== next.onTrainClick) return false;
  if (prev.onPointDragStart !== next.onPointDragStart) return false;
  if (prev.onRequestHalt !== next.onRequestHalt) return false;
  const vm1 = prev.visibleMinutes, vm2 = next.visibleMinutes;
  if (vm1.minMinutes !== vm2.minMinutes || vm1.maxMinutes !== vm2.maxMinutes) return false;
  // Compare drag state only if it is relevant to this day column
  const d1 = prev.dragState && prev.dragState.dayIndex === prev.dayIndex ? prev.dragState : null;
  const d2 = next.dragState && next.dragState.dayIndex === next.dayIndex ? next.dragState : null;
  return isDragStateEqual(d1, d2);
}

export const DayPanel = memo(DayPanelInner, propsAreEqual);