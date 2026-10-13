import { useAppStore } from '../../store/useAppStore';

export function GraphTooltip() {
  const tooltip = useAppStore((s) => s.tooltip);
  if (!tooltip) return null;
  const { x, y, content } = tooltip;
  return (
    <div className="graph-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="gt-header">
        <span className="gt-train">{content.trainNumber}</span>
        {content.trainName && <span className="gt-name">{content.trainName}</span>}
      </div>
      <div className="gt-row"><span>Station</span><strong>{content.stationCode}</strong></div>
      <div className="gt-row">
        <span className={content.kind === 'arrival' ? 'gt-arrival' : 'gt-departure'}>
          {content.kind === 'arrival' ? 'Arrival' : 'Departure'}
        </span>
        <strong>{content.time}</strong>
      </div>
      <div className="gt-row"><span>Distance</span><strong>{content.distance} km</strong></div>
      {content.day > 0 && <div className="gt-row"><span>Day</span><strong>Day {content.day + 1}</strong></div>}
    </div>
  );
}