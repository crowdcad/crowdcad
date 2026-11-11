import { describe, expect, it } from 'vitest';
import { cleanHidden, setLayerShown } from './mapLayers';

describe('map layers', () => {
  it('keeps only known kinds from a stored value', () => {
    expect(cleanHidden(['teams', 'nope', 'zones', 'teams'])).toEqual(['zones', 'teams']);
    expect(cleanHidden('teams')).toEqual([]);
    expect(cleanHidden(null)).toEqual([]);
  });

  it('shows and hides a kind', () => {
    expect(setLayerShown([], 'teams', false)).toEqual(['teams']);
    expect(setLayerShown(['teams', 'zones'], 'teams', true)).toEqual(['zones']);
    expect(setLayerShown(['zones'], 'zones', false)).toEqual(['zones']);
  });
});
