import { describe, expect, it } from 'vitest';
import type { Equipment } from '@/app/types';
import { equipmentAnchor } from './equipmentPlacement';

const eq = (location: string): Equipment => ({ id: 'e', name: 'Wheelchair 1', status: 'In Use', location });
const units = [{ team: 'Team 1', location: 'Gate A' }];

describe('equipmentAnchor', () => {
  it('draws equipment at its post', () => {
    expect(equipmentAnchor(eq('Staging'), units)).toEqual({ kind: 'post', post: 'Staging' });
  });

  it('follows the unit carrying it: its post without tracking', () => {
    expect(equipmentAnchor(eq('Team 1'), units)).toEqual({ kind: 'post', post: 'Gate A' });
  });

  it('follows the unit carrying it: its live position with tracking', () => {
    const tracking = { positions: { 'Team 1': { lat: 1, lon: 2, stale: true } }, alignments: {} };
    expect(equipmentAnchor(eq('Team 1'), units, tracking)).toEqual({ kind: 'point', lat: 1, lon: 2, faded: true });
    // No position yet: not drawn, like the unit itself.
    expect(equipmentAnchor(eq('Team 1'), units, { positions: {}, alignments: {} })).toBeNull();
  });

  it('uses the equipment tracker over its holder', () => {
    const tracking = { positions: {}, alignments: {}, equipmentPositions: { 'Wheelchair 1': { lat: 3, lon: 4, stale: false } } };
    expect(equipmentAnchor(eq('Team 1'), units, tracking)).toEqual({ kind: 'point', lat: 3, lon: 4, faded: false });
  });
});
