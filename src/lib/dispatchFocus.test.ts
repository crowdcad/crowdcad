import { describe, expect, it } from 'vitest';
import { focusSearch, parseFocus } from './dispatchFocus';

describe('parseFocus', () => {
  it('maps left-panel tabs to the left pane and everything else to the right', () => {
    expect(parseFocus('teams')).toEqual({ pane: 'left', tab: 'teams' });
    expect(parseFocus('equipment')).toEqual({ pane: 'left', tab: 'equipment' });
    expect(parseFocus('map')).toEqual({ pane: 'right', tab: 'map' });
    expect(parseFocus('clinic-123')).toEqual({ pane: 'right', tab: 'clinic-123' });
  });

  it('is null without a value', () => {
    expect(parseFocus(null)).toBeNull();
    expect(parseFocus('  ')).toBeNull();
  });
});

describe('focusSearch', () => {
  it('sets and removes the focus parameter, keeping others', () => {
    expect(focusSearch('', 'map')).toBe('?focus=map');
    expect(focusSearch('?a=1&focus=map', 'calls')).toBe('?a=1&focus=calls');
    expect(focusSearch('?a=1&focus=map', null)).toBe('?a=1');
    expect(focusSearch('?focus=map', null)).toBe('');
  });
});
