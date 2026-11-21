import { describe, expect, it } from 'vitest';
import { trackedUnitNames, type UnitTracking } from './unitTracking';

const tracking: UnitTracking = {
  positions: { Fresh: { lat: 1, lon: 2, stale: false }, Stale: { lat: 1, lon: 2, stale: true } },
  alignments: {},
};

describe('trackedUnitNames', () => {
  it('is the units with a fresh position on a TAK event', () => {
    expect([...trackedUnitNames('tak', tracking)]).toEqual(['Fresh']);
  });

  it('is empty on a standard event or without tracking', () => {
    expect(trackedUnitNames('standard', tracking).size).toBe(0);
    expect(trackedUnitNames(undefined, tracking).size).toBe(0);
    expect(trackedUnitNames('tak', null).size).toBe(0);
  });
});
