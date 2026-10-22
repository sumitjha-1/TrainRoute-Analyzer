// First 10 are hand-picked; after that every train gets its own generated colour

const BASE_COLORS = [
  '#4CC9F0', '#F72585', '#7CE38B', '#FFB703', '#B388FF',
  '#FF6B6B', '#4ADE80', '#FFD166', '#60A5FA', '#F97316',
];

const MARKERS = ['circle', 'square', 'diamond', 'triangle', 'cross'];

function colorFor(i) {
  if (i < BASE_COLORS.length) return BASE_COLORS[i];
  const k = i - BASE_COLORS.length;
  const hue = (k * 137.508) % 360;          
  const light = [62, 54, 70][k % 3];        
  const sat = [88, 78][Math.floor(k / 3) % 2];
  return `hsl(${hue.toFixed(1)}, ${sat}%, ${light}%)`;
}

export function assignTrainStyles(trains) {
  return trains.map((train, i) => ({
    ...train,
    color: colorFor(i),
    dashPattern: 'none',
    marker: MARKERS[Math.floor(i / BASE_COLORS.length) % MARKERS.length],
  }));
}