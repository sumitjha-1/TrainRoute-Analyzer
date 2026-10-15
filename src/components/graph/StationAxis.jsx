import { STATION_LABEL_COL_WIDTH } from '../../utils/graph/coordinates';
import { useAppStore, useFocusedStationCodes } from '../../store/useAppStore';

export function StationAxis({ stations, scale, height, side = 'left' }) {
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const editStationDistance = useAppStore((s) => s.editStationDistance);
  const isEditMode = useAppStore((s) => s.isEditMode);
  const selectedStationCode = useAppStore((s) => s.selectedStationCode);
  const setSelectedStation = useAppStore((s) => s.setSelectedStation);
  const focusedCodes = useFocusedStationCodes();
  const hasFocus = focusedCodes != null;
  const editable = side === 'left' && isEditMode;

  function handleEdit(e, station) {
    if (!editable) return;
    e.stopPropagation();
    requestConfirm({
      title: `Edit distance — ${station.stationCode}`,
      message: 'This changes the route file value and recalculates all trains on the graph.',
      confirmLabel: 'Save change',
      input: { label: 'Distance (km)', defaultValue: String(station.distance) },
      onConfirm: (value) => {
        const num = parseFloat(value);
        if (Number.isNaN(num) || num < 0) return;
        const result = editStationDistance(station.stationCode, num);
        if (result && !result.ok) {
          requestConfirm({ title: 'Cannot edit', message: result.error, confirmLabel: 'OK', onConfirm: () => {} });
        }
      },
    });
  }

  const W = STATION_LABEL_COL_WIDTH;
  const edgeX = side === 'left' ? W - 1 : 1;
  const tickX = side === 'left' ? W - 7 : 7;
  const textX = side === 'left' ? 6 : W - 6;
  const anchor = side === 'left' ? 'start' : 'end';

  return (
    <div className={`graph-station-axis graph-station-axis-${side}`} style={{ width: W, height }}>
      <svg width={W} height={height}>
        <line x1={edgeX} x2={edgeX} y1={0} y2={height} stroke="var(--border-strong)" />
        {stations.map((s) => {
          const y = scale.toY(s.stationCode);
          if (y == null) return null;
          const isSel = selectedStationCode === s.stationCode;
          const onTrain = hasFocus && focusedCodes.has(s.stationCode);
          const dim = hasFocus && !onTrain && !isSel;
          const state = isSel ? 'is-selected' : onTrain ? 'is-on-train' : dim ? 'is-dim' : '';
          const hot = isSel || onTrain;
          return (
            <g key={s.stationCode}>
              {hot && <rect x={0} y={y - 12} width={W} height={24} fill="var(--accent-soft)" opacity={isSel ? 1 : 0.55} />}
              {/* tick graph ki station line ke bilkul same y par */}
              <line x1={tickX} x2={edgeX} y1={y} y2={y} stroke={hot ? 'var(--accent)' : 'var(--border-strong)'} strokeWidth={1.2} />
              <circle cx={tickX} cy={y} r={isSel ? 3.2 : 2.3} fill={hot ? 'var(--accent)' : 'var(--text-muted)'} />
              <text x={textX} y={y - 2} textAnchor={anchor}
                    className={`graph-station-code ${state}`}
                    onClick={() => setSelectedStation(isSel ? null : s.stationCode, { scroll: false })}>
                {s.stationCode}
              </text>
              <text x={textX} y={y + 9.5} textAnchor={anchor}
                    className={`graph-station-dist ${state} ${editable ? 'graph-station-dist-editable' : ''}`}
                    onClick={(e) => handleEdit(e, s)}>
                {s.distance} km
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}