import { HOUR_LINES } from '../../utils/graph/gridBuilder';
import { minutesToX, panelWidth, STATION_LABEL_COL_WIDTH, DAY_PANEL_HEADER_HEIGHT } from '../../utils/graph/coordinates';

export function TimeHeader({ zoom, position = 'top', hideCorner = false }) {
  const width = panelWidth(zoom);
  const cornerLabel = position === 'top' ? 'Station / Distance' : '';

  return (
    <div className={`graph-time-header graph-time-header-${position}`}>
      {!hideCorner && <div className="graph-corner">{cornerLabel}</div>}
      <div className="graph-time-track" style={{ width }}>
        <svg width={width} height={DAY_PANEL_HEADER_HEIGHT}>
          {HOUR_LINES.map((h) => (
            <g key={h.minutesOfDay}>
              <line
                x1={minutesToX(h.minutesOfDay, zoom)}
                x2={minutesToX(h.minutesOfDay, zoom)}
                y1={position === 'top' ? DAY_PANEL_HEADER_HEIGHT - 8 : 0}
                y2={position === 'top' ? DAY_PANEL_HEADER_HEIGHT : 8}
                stroke="var(--grid-hour)"
                strokeWidth={1.5}
              />
              <text
                x={minutesToX(h.minutesOfDay, zoom)}
                y={position === 'top' ? DAY_PANEL_HEADER_HEIGHT - 12 : 18}
                textAnchor="middle"
                className="graph-time-label"
              >
                {h.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export { STATION_LABEL_COL_WIDTH };