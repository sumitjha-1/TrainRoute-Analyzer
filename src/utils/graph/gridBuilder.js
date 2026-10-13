// These grids never change at runtime (they only depend on the fixed 24h
// clock), so they're computed exactly once at module load instead of being
// rebuilt on every render of every day panel. This mattered a lot with many
// day panels on screen at once: rebuilding ~700 array entries per panel per
// render was pure waste.

function computeHourLines() {
  const lines = [];
  for (let h = 0; h < 24; h++) {
    lines.push({ minutesOfDay: h * 60, label: String(h).padStart(2, '0') });
  }
  return lines;
}

function computeTenMinuteLines() {
  const lines = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 10; m < 60; m += 10) {
      lines.push({ minutesOfDay: h * 60 + m });
    }
  }
  return lines;
}

function computeMinorDots() {
  const dots = [];
  for (let h = 0; h < 24; h++) {
    for (let base = 0; base < 60; base += 10) {
      [2, 4, 6, 8].forEach((offset) => {
        dots.push({ minutesOfDay: h * 60 + base + offset });
      });
    }
  }
  return dots;
}

export const HOUR_LINES = computeHourLines();
export const TEN_MIN_LINES = computeTenMinuteLines();
export const MINOR_DOTS = computeMinorDots();

// Kept for any external callers — now just return the cached arrays.
export function buildHourLines() {
  return HOUR_LINES;
}
export function buildTenMinuteLines() {
  return TEN_MIN_LINES;
}
export function buildMinorDots() {
  return MINOR_DOTS;
}