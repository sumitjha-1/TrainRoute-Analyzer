import './DayBoundary.css';

/**
 * Purely decorative day/weekday boundary marker — a soft, blurred yellow/gold
 * vertical band. Never intercepts pointer events, never touches graph state,
 * coordinates, zoom, or edit logic. Positioned by the parent using the same
 * `left` pixel value the day columns are laid out at, so it always sits
 * exactly on the Day N -> Day N+1 seam and scrolls with the graph content.
 */
export function DayBoundary({ left, height }) {
  return (
    <div
      className="graph-day-boundary"
      style={{ left, height }}
      aria-hidden="true"
    />
  );
}