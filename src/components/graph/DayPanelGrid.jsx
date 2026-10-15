import { memo, useMemo } from 'react';
import { HOUR_LINES, TEN_MIN_LINES, MINOR_DOTS } from '../../utils/graph/gridBuilder';
import { minutesToX, rangesOverlap } from '../../utils/graph/coordinates';
import { formatClock, absoluteToClock } from '../../utils/time/time';
import { useAppStore, isStopEdited, useFocusedStationCodes } from '../../store/useAppStore';
import { errorMarkKey } from '../../utils/graph/saveEngine';

const BUFFER_MIN = 30;

function inRange(minutesOfDay, range) {
  return minutesOfDay >= range.minMinutes - BUFFER_MIN && minutesOfDay <= range.maxMinutes + BUFFER_MIN;
}

function DayPanelGridInner({
  dayIndex,
  width,
  height,
  zoom,
  stations,
  scale,
  trainSegments, // [{ train, segments, prevSegments?, layerDay?, layerOpacity?, layerDashPattern? }]
  visibleMinutes,
  onPointHover,
  onPointLeave,
  onTrainClick,
  onPointDragStart,
  onRequestHalt,
  dragState,
}) {
  const minorDots = zoom >= 0.6 ? MINOR_DOTS : [];
  const showMinorDots = zoom >= 0.6;
  const isDraggingHere = !!dragState && dragState.dayIndex === dayIndex;

  const focusedTrainNumber = useAppStore((s) => s.focusedTrainNumber);
  const selectedStationCode = useAppStore((s) => s.selectedStationCode);
  const focusedStationCodes = useFocusedStationCodes();

  const orderedTrainSegments = useMemo(() => {
    if (!focusedTrainNumber) return trainSegments;
    const idx = trainSegments.findIndex((e) => e.train.trainNumber === focusedTrainNumber);
    if (idx === -1 || idx === trainSegments.length - 1) return trainSegments;
    const copy = trainSegments.slice();
    const [focused] = copy.splice(idx, 1);
    copy.push(focused);
    return copy;
  }, [trainSegments, focusedTrainNumber]);

  const visibleHours = HOUR_LINES.filter((h) => inRange(h.minutesOfDay, visibleMinutes));
  const visibleTenMin = TEN_MIN_LINES.filter((t) => inRange(t.minutesOfDay, visibleMinutes));
  const visibleMinor = showMinorDots ? minorDots.filter((d) => inRange(d.minutesOfDay, visibleMinutes)) : [];

  return (
    <svg width={width} height={height} className="graph-day-svg">
      {/* station guide lines — selected station is thick, focused train's stations are tinted */}
      {stations.map((s) => {
        const y = scale.toY(s.stationCode);
        if (y == null) return null;
        const isSelected = selectedStationCode === s.stationCode;
        const isOnTrain = !!focusedStationCodes && focusedStationCodes.has(s.stationCode);
        const isDragTargetRow = isDraggingHere && dragState.isStationDrag && dragState.candidateStationCode === s.stationCode;

        let stroke = 'var(--grid-station)';
        let strokeWidth = 1;
        if (isOnTrain) { stroke = 'var(--accent)'; strokeWidth = 1.2; }
        if (isSelected) { stroke = 'var(--accent)'; strokeWidth = 2.6; }
        if (isDragTargetRow) { stroke = 'var(--accent)'; strokeWidth = 1.8; }

        return (
          <g key={s.stationCode}>
            {isSelected && (
              <rect x={0} y={y - 11} width={width} height={22} fill="var(--accent-soft)" pointerEvents="none" />
            )}
            <line
              x1={0} x2={width} y1={y} y2={y}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={isOnTrain && !isSelected && !isDragTargetRow ? 0.4 : 1}
            />
          </g>
        );
      })}

      {visibleMinor.map((d) => (
        <line
          key={`minor-${d.minutesOfDay}`}
          x1={minutesToX(d.minutesOfDay, zoom)}
          x2={minutesToX(d.minutesOfDay, zoom)}
          y1={0}
          y2={height}
          stroke="var(--grid-minor-dot)"
          strokeWidth={1}
          strokeDasharray="1 5"
        />
      ))}

      {visibleTenMin.map((t) => (
        <line
          key={`ten-${t.minutesOfDay}`}
          x1={minutesToX(t.minutesOfDay, zoom)}
          x2={minutesToX(t.minutesOfDay, zoom)}
          y1={0}
          y2={height}
          stroke="var(--grid-ten-min)"
          strokeWidth={1}
        />
      ))}

      {visibleHours.map((h) => (
        <line
          key={`hour-${h.minutesOfDay}`}
          x1={minutesToX(h.minutesOfDay, zoom)}
          x2={minutesToX(h.minutesOfDay, zoom)}
          y1={0}
          y2={height}
          stroke="var(--grid-hour)"
          strokeWidth={h.minutesOfDay % 360 === 0 ? 1.6 : 1.1}
        />
      ))}

      {orderedTrainSegments.map(({ train, segments, prevSegments, layerDay, layerOpacity, layerDashPattern }) => (
        <TrainPath
          key={layerDay != null ? `${train.trainNumber}-d${layerDay}` : train.trainNumber}
          train={train}
          segments={segments}
          prevSegments={prevSegments}
          zoom={zoom}
          scale={scale}
          stations={stations}
          dayIndex={dayIndex}
          visibleMinutes={visibleMinutes}
          layerOpacity={layerOpacity}
          layerDashPattern={layerDashPattern}
          dragState={isDraggingHere && dragState.trainNumber === train.trainNumber ? dragState : null}
          onPointHover={onPointHover}
          onPointLeave={onPointLeave}
          onTrainClick={onTrainClick}
          onPointDragStart={onPointDragStart}
          onRequestHalt={onRequestHalt}
        />
      ))}

      {isDraggingHere && <DragGhost dragState={dragState} />}
    </svg>
  );
}

function segmentsPropsEqual(prev, next) {
  return (
    prev.train === next.train &&
    prev.segments === next.segments &&
    prev.prevSegments === next.prevSegments &&
    prev.zoom === next.zoom &&
    prev.scale === next.scale &&
    prev.stations === next.stations &&
    prev.dayIndex === next.dayIndex &&
    prev.layerOpacity === next.layerOpacity &&
    prev.layerDashPattern === next.layerDashPattern &&
    prev.visibleMinutes.minMinutes === next.visibleMinutes.minMinutes &&
    prev.visibleMinutes.maxMinutes === next.visibleMinutes.maxMinutes &&
    prev.dragState === next.dragState &&
    prev.onPointHover === next.onPointHover &&
    prev.onPointLeave === next.onPointLeave &&
    prev.onTrainClick === next.onTrainClick &&
    prev.onPointDragStart === next.onPointDragStart &&
    prev.onRequestHalt === next.onRequestHalt
  );
}

const TrainPath = memo(function TrainPath({
  train, segments, prevSegments, zoom, scale, stations, dayIndex, visibleMinutes, dragState,
  layerOpacity = 1, layerDashPattern,
  onPointHover, onPointLeave, onTrainClick, onPointDragStart, onRequestHalt,
}) {
  const isHovered = useAppStore((s) => s.hoveredTrainNumber === train.trainNumber);
  const isFocused = useAppStore((s) => s.focusedTrainNumber === train.trainNumber);
  const anyFocus = useAppStore((s) => s.focusedTrainNumber != null);
  const isRecentlyUpdated = useAppStore((s) => s.lastUpdatedTrainNumber === train.trainNumber);
  const hasEdits = useAppStore((s) => s.editedTrainNumbers.has(train.trainNumber));
  const lastEditedKey = useAppStore((s) => s.lastEditedKey);
  const lastEditedStation = hasEdits && lastEditedKey && lastEditedKey.startsWith(train.trainNumber + '\u0000')
    ? lastEditedKey.slice(train.trainNumber.length + 1)
    : null;
  const editingOther = useAppStore(
    (s) => s.isEditMode && s.editedTrainNumbers.size > 0 && !s.editedTrainNumbers.has(train.trainNumber)
  );

  const isDimmed = (anyFocus && !isFocused) || editingOther;
  const strokeWidth = isFocused || hasEdits ? 3.8 : isHovered ? 3 : 2;
  const dashPattern = layerDashPattern ?? train.dashPattern;

  const visibleSegments = segments.filter((seg) =>
    rangesOverlap(seg.from.minutesOfDay, seg.to.minutesOfDay, visibleMinutes.minMinutes, visibleMinutes.maxMinutes)
  );

  const yOf = (end) => scale.toY(end.point?.stationCode) ?? scale.toYFromDistance(end.distance);

  const lines = visibleSegments.map((seg) => ({
    seg,
    x1: minutesToX(seg.from.minutesOfDay, zoom),
    x2: minutesToX(seg.to.minutesOfDay, zoom),
    y1: yOf(seg.from),
    y2: yOf(seg.to),
  }));

  const prevLines = (prevSegments || [])
    .filter((seg) =>
      rangesOverlap(seg.from.minutesOfDay, seg.to.minutesOfDay, visibleMinutes.minMinutes, visibleMinutes.maxMinutes)
    )
    .map((seg) => ({
      seg,
      x1: minutesToX(seg.from.minutesOfDay, zoom),
      x2: minutesToX(seg.to.minutesOfDay, zoom),
      y1: yOf(seg.from),
      y2: yOf(seg.to),
    }));

  const lastSeg = visibleSegments[visibleSegments.length - 1];

  return (
    <g
      opacity={(isDimmed ? 0.6 : 1) * layerOpacity}
      onClick={() => onTrainClick(train.trainNumber)}
      style={{ cursor: 'pointer' }}
    >
      {/* previous (before edit / last saved) path — highlighter-pen stroke behind the current one */}
      {prevLines.map(({ x1, y1, x2, y2 }, i) => (
        <line
          key={`prev-${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={train.color}
          strokeWidth={10}
          strokeLinecap="round"
          opacity={0.2}
          pointerEvents="none"
          className="graph-prev-path"
        />
      ))}

      {isRecentlyUpdated && lines.map(({ x1, y1, x2, y2 }, i) => (
        <line
          key={`halo-${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="var(--recent-highlight)"
          strokeWidth={strokeWidth + 7}
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}
      {lines.map(({ seg, x1, y1, x2, y2 }, i) => {
        const segEdited = hasEdits && (
          (seg.from.point && isStationEditedRef(seg.from.point, train)) ||
          (seg.to.point && isStationEditedRef(seg.to.point, train))
        );
        const cls = [segEdited && 'graph-segment-edited', isFocused && 'graph-segment-focused']
          .filter(Boolean).join(' ') || undefined;
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={train.color}
            strokeWidth={segEdited ? strokeWidth + 1.5 : strokeWidth}
            strokeDasharray={dashPattern === 'none' ? undefined : dashPattern}
            strokeLinecap="round"
            opacity={dragState ? 0.45 : 1}
            className={cls}
          />
        );
      })}
      {visibleSegments.map((seg, i) => (
        <PointMarker
          key={`p-${i}-from`}
          seg={seg.from}
          zoom={zoom}
          scale={scale}
          train={train}
          dayIndex={dayIndex}
          dragState={dragState}
          isEdited={seg.from.point ? hasEditKey(train, seg.from.point.stationCode) : false}
          isLastEdited={seg.from.point ? lastEditedStation === seg.from.point.stationCode : false}
          onHover={onPointHover}
          onLeave={onPointLeave}
          onDragStart={onPointDragStart}
          onRequestHalt={onRequestHalt}
        />
      ))}
      {lastSeg && (
        <PointMarker
          seg={lastSeg.to}
          zoom={zoom}
          scale={scale}
          train={train}
          dayIndex={dayIndex}
          dragState={dragState}
          isEdited={lastSeg.to.point ? hasEditKey(train, lastSeg.to.point.stationCode) : false}
          isLastEdited={lastSeg.to.point ? lastEditedStation === lastSeg.to.point.stationCode : false}
          onHover={onPointHover}
          onLeave={onPointLeave}
          onDragStart={onPointDragStart}
          onRequestHalt={onRequestHalt}
        />
      )}
      {visibleSegments.length > 0 && visibleSegments[0].from.point && (
        <TrainLabel seg={visibleSegments[0].from} zoom={zoom} scale={scale} train={train} />
      )}
    </g>
  );
}, segmentsPropsEqual);

function hasEditKey(train, stationCode) {
  return isStopEdited(useAppStore.getState(), train.trainNumber, stationCode);
}
function isStationEditedRef(point, train) {
  return isStopEdited(useAppStore.getState(), train.trainNumber, point.stationCode);
}

function DragGhost({ dragState }) {
  const { x, y, currentMinutes, origMinutes, linked, single, isSoleEvent } = dragState;
  const c = absoluteToClock(currentMinutes);
  const label = `${formatClock(c)}${c.day > 0 ? ` · D${c.day + 1}` : ''}`;
  const delta = currentMinutes - origMinutes;
  const lines = [];
  if (delta !== 0) {
    lines.push({
      text: `${delta > 0 ? '+' : ''}${delta} min`,
      cls: `graph-drag-ghost-delta ${delta > 0 ? 'is-positive' : 'is-negative'}`,
    });
    if (!isSoleEvent) {
      lines.push({
        text: single ? 'One side only · halt changes'
          : linked ? 'Non-stop · moves as one'
          : 'Other side follows at 1 min if crossed',
        cls: 'graph-drag-ghost-sub',
      });
    }
  }
  const longest = Math.max(label.length * 6.5, ...lines.map((l) => l.text.length * 5.4));
  const boxWidth = Math.max(62, longest + 16);
  const boxHeight = 20 + lines.length * 13;

  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={9} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.55}>
        <animate attributeName="r" values="7;11;7" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0.15;0.6" dur="1.1s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={5.5} fill="var(--accent)" stroke="var(--bg-canvas)" strokeWidth={1.5} />
      <g transform={`translate(${x + 12}, ${y - 14})`}>
        <rect width={boxWidth} height={boxHeight} rx={5} fill="var(--bg-panel-raised)" stroke="var(--accent)" strokeWidth={1} opacity={0.97} />
        <text x={8} y={14} className="graph-drag-ghost-label">{label}</text>
        {lines.map((l, i) => (
          <text key={i} x={8} y={27 + i * 13} className={l.cls}>{l.text}</text>
        ))}
      </g>
    </g>
  );
}

function PointMarker({ seg, zoom, scale, train, dayIndex, dragState, isEdited, isLastEdited, onHover, onLeave, onDragStart, onRequestHalt }) {
  const isEditMode = useAppStore((s) => s.isEditMode);
  const errKey = seg.point ? errorMarkKey(train.trainNumber, seg.point.stationCode, seg.point.kind) : null;
  const hasSaveError = useAppStore((s) => (errKey ? s.saveErrorKeys.has(errKey) : false));

  if (!seg.point) return null;
  const x = minutesToX(seg.minutesOfDay, zoom);
  const y = scale.toY(seg.point.stationCode);
  if (y == null) return null;
  const isDeparture = seg.point.kind === 'departure';
  const isSoleEvent = !!seg.point.isSoleEvent;
  const r = 5;

  const isThisPointDragging =
    !!dragState &&
    dragState.trainNumber === train.trainNumber &&
    dragState.stationCode === seg.point.stationCode &&
    ((dragState.linked && !dragState.single) || dragState.field === (isDeparture ? 'departureRaw' : 'arrivalRaw'));

  function handlePointerDown(e) {
    if (!isEditMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!onDragStart) return;
    const svgEl = e.currentTarget.ownerSVGElement || e.currentTarget.closest('svg');
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onDragStart(e, { train, point: seg.point, dayIndex, svgEl });
  }

  function handleRequestHaltClick(e) {
    // double-click sirf asli stoppage par: use non-stoppage banata hai
    if (!isEditMode || seg.point.isPassThrough || seg.point.isSoleEvent) return;
    e.preventDefault();
    e.stopPropagation();
    onRequestHalt && onRequestHalt({ train, stationCode: seg.point.stationCode });
  }

  const hitProps = {
    onPointerEnter: (e) => onHover(e, { train, point: seg.point }),
    onPointerMove: (e) => onHover(e, { train, point: seg.point }),
    onPointerLeave: onLeave,
    onPointerDown: handlePointerDown,
    onDoubleClick: handleRequestHaltClick,
    onContextMenu: handleRequestHaltClick,
    className: 'graph-point-marker',
    style: {
      cursor: !isEditMode ? 'default' : isThisPointDragging ? 'grabbing' : 'grab',
      touchAction: isEditMode ? 'none' : 'auto',
    },
  };

  const visualClassName = `graph-point-marker-visual ${isEdited ? 'graph-point-edited' : ''} ${isLastEdited ? 'graph-point-last-edited' : ''}`;
  const dragProps = {
    stroke: 'var(--bg-canvas)',
    strokeWidth: isThisPointDragging ? 1.4 : 0.75,
    opacity: isThisPointDragging ? 0.4 : 1,
    pointerEvents: 'none',
    className: visualClassName,
  };

  return (
    <g>
      {hasSaveError && (
        <circle cx={x} cy={y} r={10} fill="none" stroke="var(--danger)" strokeWidth={2}
                className="graph-point-error" pointerEvents="none" />
      )}
      {isSoleEvent ? (
        <circle cx={x} cy={y} r={10} fill="transparent" {...hitProps} />
      ) : (
        /* arrival = left half-disc, departure = right half-disc → never ambiguous */
        <path
          d={`M ${x} ${y - 10} A 10 10 0 0 ${isDeparture ? 1 : 0} ${x} ${y + 10} Z`}
          fill="transparent"
          {...hitProps}
        />
      )}
      {isSoleEvent ? (
        <circle cx={x} cy={y} r={r} fill={train.color} {...dragProps} />
      ) : (
        <path
          d={`M ${x} ${y - r} A ${r} ${r} 0 0 ${isDeparture ? 1 : 0} ${x} ${y + r} Z`}
          fill={isDeparture ? 'var(--marker-departure)' : 'var(--marker-arrival)'}
          {...dragProps}
        />
      )}
    </g>
  );
}

function TrainLabel({ seg, zoom, scale, train }) {
  const x = minutesToX(seg.minutesOfDay, zoom);
  const y = scale.toY(seg.point.stationCode);
  if (y == null) return null;
  const label = train.trainNumber;
  const width = label.length * 6.5 + 10;
  return (
    <g transform={`translate(${x + 8}, ${y - 20})`} pointerEvents="none">
      <rect width={width} height={16} rx={4} fill="var(--bg-canvas)" stroke={train.color} strokeWidth={1} opacity={0.92} />
      <text x={width / 2} y={11.5} textAnchor="middle" className="graph-train-label" fill={train.color}>
        {label}
      </text>
    </g>
  );
}

function panelPropsEqual(prev, next) {
  return (
    prev.dayIndex === next.dayIndex &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.zoom === next.zoom &&
    prev.stations === next.stations &&
    prev.scale === next.scale &&
    prev.trainSegments === next.trainSegments &&
    prev.visibleMinutes.minMinutes === next.visibleMinutes.minMinutes &&
    prev.visibleMinutes.maxMinutes === next.visibleMinutes.maxMinutes &&
    prev.onPointHover === next.onPointHover &&
    prev.onPointLeave === next.onPointLeave &&
    prev.onTrainClick === next.onTrainClick &&
    prev.onPointDragStart === next.onPointDragStart &&
    prev.onRequestHalt === next.onRequestHalt &&
    prev.dragState === next.dragState
  );
}

export const DayPanelGrid = memo(DayPanelGridInner, panelPropsEqual);

export function formatTooltip({ train, point }) {
  return {
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    stationCode: point.stationCode,
    kind: point.kind,
    time: point.clock ? formatClock(point.clock) : '—',
    day: point.day,
    distance: point.distance,
  };
}