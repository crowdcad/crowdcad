/**
 * The heat map's color scale, cool to hot: purple for the least time spent in
 * a cell, through blue, cyan, green, yellow and orange, to red for the most.
 */
export const HEAT_STOPS: readonly [number, number, number][] = [
  [124, 58, 237], // purple
  [37, 99, 235], // blue
  [6, 182, 212], // cyan
  [34, 197, 94], // green
  [234, 179, 8], // yellow
  [249, 115, 22], // orange
  [220, 38, 38], // red
];

/** Every heat cell's opacity; the color carries the time. */
export const HEAT_OPACITY = 0.9;

/** The scale's color at t (0 = coolest, 1 = hottest), as an rgb() string. */
export function heatColor(t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [HEAT_STOPS[i]!, HEAT_STOPS[i + 1]!];
  const mix = (k: number) => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** The scale as a CSS gradient, for a legend. */
export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${HEAT_STOPS.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`).join(', ')})`;
