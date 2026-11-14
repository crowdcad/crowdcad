import { describe, expect, it } from 'vitest';
import { HEAT_STOPS, heatColor } from './heat';

describe('heatColor', () => {
  const rgb = ([r, g, b]: readonly number[]) => `rgb(${r}, ${g}, ${b})`;

  it('runs from purple (coolest) to red (hottest)', () => {
    expect(heatColor(0)).toBe(rgb(HEAT_STOPS[0]!));
    expect(heatColor(1)).toBe(rgb(HEAT_STOPS[HEAT_STOPS.length - 1]!));
  });

  it('blends between neighbouring stops', () => {
    const half = 0.5 / (HEAT_STOPS.length - 1);
    const [a, b] = [HEAT_STOPS[0]!, HEAT_STOPS[1]!];
    expect(heatColor(half)).toBe(rgb(a.map((v, k) => Math.round(v + (b[k]! - v) / 2))));
  });

  it('clamps out-of-range and invalid input', () => {
    expect(heatColor(-1)).toBe(heatColor(0));
    expect(heatColor(2)).toBe(heatColor(1));
    expect(heatColor(Number.NaN)).toBe(heatColor(0));
  });
});
