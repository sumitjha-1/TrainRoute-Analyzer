export function TrainMarkerIcon({ color, marker, size = 10 }) {
  const s = size;
  const half = s / 2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ flexShrink: 0 }}>
      {marker === 'square' && <rect width={s} height={s} rx={1.5} fill={color} />}
      {marker === 'diamond' && <rect width={s * 0.75} height={s * 0.75} x={s * 0.125} y={s * 0.125} transform={`rotate(45 ${half} ${half})`} fill={color} />}
      {marker === 'triangle' && <polygon points={`${half},0 ${s},${s} 0,${s}`} fill={color} />}
      {marker === 'cross' && (
        <g stroke={color} strokeWidth={s * 0.28} strokeLinecap="round">
          <line x1={s * 0.15} y1={s * 0.15} x2={s * 0.85} y2={s * 0.85} />
          <line x1={s * 0.85} y1={s * 0.15} x2={s * 0.15} y2={s * 0.85} />
        </g>
      )}
      {(!marker || marker === 'circle') && <circle cx={half} cy={half} r={half} fill={color} />}
    </svg>
  );
}
