import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { cleanRosterFields, findRosterPerson, memberName, staffedNames, staffedUpdates, type RosterPerson } from './roster';

const roster: RosterPerson[] = [
  { id: 'a', name: 'Jane Doe', eventsStaffed: 2, staffedEventIds: ['e0'] },
  { id: 'b', name: 'Sam Lee' },
];

describe('roster', () => {
  it('reads plain names from stored member strings', () => {
    expect(memberName('Jane Doe [EMT] (Lead)')).toBe('Jane Doe');
    expect(memberName('Sam Lee [Paramedic]')).toBe('Sam Lee');
    expect(memberName('Pat')).toBe('Pat');
    const event = { staff: [{ members: ['Jane Doe [EMT] (Lead)', 'Sam Lee [EMT]'] }], supervisor: [{ member: 'Jane Doe [EMT]' }] } as unknown as Event;
    expect(staffedNames(event)).toEqual(['Jane Doe', 'Sam Lee']);
  });

  it('counts each person once per event', () => {
    expect(staffedUpdates(roster, 'e1', ['jane doe', 'Sam Lee', 'Nobody', 'Jane Doe'])).toEqual([
      { id: 'a', eventsStaffed: 3, staffedEventIds: ['e0', 'e1'] },
      { id: 'b', eventsStaffed: 1, staffedEventIds: ['e1'] },
    ]);
    expect(staffedUpdates(roster, 'e0', ['Jane Doe'])).toEqual([]);
  });

  it('matches names only when exactly one person has it', () => {
    expect(findRosterPerson(roster, ' JANE DOE ')?.id).toBe('a');
    expect(findRosterPerson([...roster, { id: 'c', name: 'Jane Doe' }], 'Jane Doe')).toBeUndefined();
  });

  it('trims fields and drops empty ones', () => {
    expect(cleanRosterFields({ name: '  Jane   Doe ', licensure: ' EMT ', email: '', eventsStaffed: -3 })).toEqual({ name: 'Jane Doe', licensure: 'EMT', eventsStaffed: 0 });
  });
});
