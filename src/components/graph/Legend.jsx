import './Legend.css';

function ArrivalDepartureIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
      <path d="M 7 1 A 6 6 0 0 0 7 13 Z" fill="var(--marker-arrival)" />
      <path d="M 7 1 A 6 6 0 0 1 7 13 Z" fill="var(--marker-departure)" />
    </svg>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-group">
        <ArrivalDepartureIcon /> Arrival · Departure
      </div>
      <div className="legend-group">
        <span className="legend-line legend-line-diag" /> Movement
        <span className="legend-line legend-line-flat" /> Halt
      </div>
      <div className="legend-group">
        <span className="legend-line legend-line-prev" /> Previous path
        <span className="legend-swatch legend-swatch-edited" /> Edited
        <span className="legend-swatch legend-swatch-selected" /> Selected station
      </div>
      <div className="legend-group">
        <div className="legend-line legend-line-hour" /> Hour
        <div className="legend-line legend-line-ten" /> 10 min
      </div>
      <div className="legend-group legend-hint">
        Drag a dot sideways for time · hold Shift to move one side only · drag up/down for station
      </div>
    </div>
  );
}