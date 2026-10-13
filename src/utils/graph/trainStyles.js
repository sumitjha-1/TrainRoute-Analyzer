// Palette tuned for a dark operations console: high-contrast, colorblind-considerate,
// no two adjacent hues that read the same on a projector.
const COLORS = [
  '#4CC9F0', '#F72585', '#7CE38B', '#FFB703', '#B388FF',
  '#FF6B6B', '#4ADE80', '#FFD166', '#60A5FA', '#F97316',
];

const DASH_PATTERNS = [
  'none', '6 3', '2 3', '10 3 2 3', '1 3',
];

const MARKERS = ['circle', 'square', 'diamond', 'triangle', 'cross'];

export function assignTrainStyles(trains) {
  return trains.map((train, i) => ({
    ...train,
    color: COLORS[i % COLORS.length],
    dashPattern: DASH_PATTERNS[Math.floor(i / COLORS.length) % DASH_PATTERNS.length],
    marker: MARKERS[Math.floor(i / COLORS.length) % MARKERS.length],
  }));
}
