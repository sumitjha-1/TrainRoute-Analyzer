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

  const edgeX = side === 'left' ? STATION_LABEL_COL_WIDTH - 1 : 1;
  const markX = side === 'left' ? STATION_LABEL_COL_WIDTH - 7 : 7;
  const textX = side === 'left' ? 8 : STATION_LABEL_COL_WIDTH - 8;
  const anchor = side === 'left' ? 'start' : 'end';

  return (
    <div className={`graph-station-axis graph-station-axis-${side}`} style={{ width: STATION_LABEL_COL_WIDTH, height }}>
      <svg width={STATION_LABEL_COL_WIDTH} height={height}>
        <line x1={edgeX} x2={edgeX} y1={0} y2={height} stroke="var(--border-strong)" />
        {stations.map((s) => {
          const y = scale.toY(s.stationCode);
          if (y == null) return null;
          const isSel = selectedStationCode === s.stationCode;
          const onTrain = hasFocus && focusedCodes.has(s.stationCode);
          const dim = hasFocus && !onTrain && !isSel;
          const state = isSel ? 'is-selected' : onTrain ? 'is-on-train' : dim ? 'is-dim' : '';
          return (
            <g key={s.stationCode}>
              {(isSel || onTrain) && (
                <rect x={0} y={y - 13} width={STATION_LABEL_COL_WIDTH} height={26}
                      fill="var(--accent-soft)" opacity={isSel ? 1 : 0.55} />
              )}
              {/* small tick only — no line running under the station name */}
              <circle cx={markX} cy={y} r={isSel ? 3.5 : 2.5}
                      fill={isSel || onTrain ? 'var(--accent)' : 'var(--text-muted)'} />
              <text x={textX} y={y - 3} textAnchor={anchor}
                    className={`graph-station-code ${state}`}
                    onClick={() => setSelectedStation(isSel ? null : s.stationCode, { scroll: false })}>
                {s.stationCode}
              </text>
              <text x={textX} y={y + 10} textAnchor={anchor}
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