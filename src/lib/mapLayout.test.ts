import { describe, expect, it } from 'vitest';
import type { Equipment, Vehicle } from '@/app/types';
import type { UnitTracking } from './unitTracking';
import { equipmentLayout, unitGroups } from './mapLayout';

const eq = (name: string, location?: string, status = 'Available'): Equipment => ({ id: name, name, status, location });
const units = [
  { team: 'Team 1', location: 'Gate A', status: 'Available' },
  { team: 'Team 2', location: 'Gate A', status: 'En Route' },
  { team: 'Team 3', location: 'Gate B', status: 'On Break' },
];
const tracking = (positions: UnitTracking['positions'], equipmentPositions?: UnitTracking['equipmentPositions']): UnitTracking => ({ positions, alignments: {}, equipmentPositions });
const everywhere = () => true;

describe('unitGroups', () => {
  it('stacks units beside the same post, most urgent first', () => {
    const groups = unitGroups(units, null, everywhere);
    expect(groups.map((g) => [g.key, g.units.map((u) => u.team)])).toEqual([
      ['post:Gate A', ['Team 2', 'Team 1']],
      ['post:Gate B', ['Team 3']],
    ]);
    expect(groups.every((g) => g.beside)).toBe(true);
  });

  it('draws a tracked unit alone at its position, with its heading', () => {
    const groups = unitGroups(units, tracking({ 'Team 1': { lat: 1, lon: 2, stale: false, heading: 90 } }), everywhere);
    expect(groups[0]).toEqual({ key: 'unit:Team 1', anchor: { kind: 'point', lat: 1, lon: 2 }, beside: false, stale: false, heading: 90, units: [units[0]] });
    expect(groups.find((g) => g.key === 'post:Gate A')?.units.map((u) => u.team)).toEqual(['Team 2']);
  });

  it('leaves off a position the map can not show', () => {
    const groups = unitGroups(units, tracking({ 'Team 1': { lat: 1, lon: 2, stale: false } }), () => false);
    expect(groups.flatMap((g) => g.units.map((u) => u.team))).toEqual(['Team 2', 'Team 3']);
  });

  it('puts units on a call with a dropped pin beside the pin, or at their post when the map can not show it', () => {
    const t = tracking({ 'Team 1': { lat: 1, lon: 2, stale: false, atCall: '7' }, 'Team 2': { lat: 1, lon: 2, stale: false, atCall: '7' } });
    expect(unitGroups(units, t, everywhere)[0]).toMatchObject({ key: 'call:7', beside: true });
    expect(unitGroups(units, t, () => false)[0]).toMatchObject({ key: 'post:Gate A' });
  });
});

describe('equipmentLayout', () => {
  it('stacks equipment at a post, most urgent first, and gives a unit what it has', () => {
    const { carried, groups } = equipmentLayout([eq('AED 1', 'Gate A'), eq('Gurney 1', 'Gate A', 'In Use'), eq('Radio 1', 'Team 1')], units, null);
    expect(carried.get('Team 1')?.map((e) => e.name)).toEqual(['Radio 1']);
    expect(groups.map((g) => [g.key, g.items.map((e) => e.name)])).toEqual([['post:Gate A', ['Gurney 1', 'AED 1']]]);
  });

  it('draws an item with its own tracker there, over its holder', () => {
    const { carried, groups } = equipmentLayout([eq('Radio 1', 'Team 1')], units, tracking({}, { 'Radio 1': { lat: 3, lon: 4, stale: true } }));
    expect(carried.size).toBe(0);
    expect(groups[0]).toMatchObject({ anchor: { kind: 'point', lat: 3, lon: 4 }, beside: false, stale: true });
  });

  it('shows equipment on a vehicle where the vehicle is: a post, or with its crew', () => {
    const vehicles: Vehicle[] = [
      { id: 'v1', name: 'Cart 1', location: 'Gate B' },
      { id: 'v2', name: 'Cart 2', location: 'Team 3' },
    ];
    const { carried, groups } = equipmentLayout([eq('Gurney 1', 'Cart 1'), eq('AED 1', 'Cart 2')], units, null, vehicles);
    expect(groups.map((g) => g.key)).toEqual(['post:Gate B']);
    expect(carried.get('Team 3')?.map((e) => e.name)).toEqual(['AED 1']);
  });
});
