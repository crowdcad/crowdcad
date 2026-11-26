import { describe, expect, it } from 'vitest';
import type { RosterPerson } from './roster';
import { guessRosterMapping, parseCsv, rosterImport } from './rosterCsv';

describe('roster CSV import', () => {
  it('reads quoted fields, commas, quotes and line breaks', () => {
    const text = '﻿Name,Notes\r\n"Doe, Jane","Says ""hi""\ntwice"\r\n\r\nSam,\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Notes'],
      ['Doe, Jane', 'Says "hi"\ntwice'],
      ['Sam', ''],
    ]);
  });

  it('guesses columns from the headers', () => {
    expect(guessRosterMapping(['Full Name', 'Certification Level', 'E-mail', 'Mobile Phone', 'City', 'Comments', 'Events Staffed'])).toEqual({
      name: 0,
      licensure: 1,
      email: 2,
      phone: 3,
      region: 4,
      notes: 5,
      eventsStaffed: 6,
    });
    expect(guessRosterMapping(['First Name', 'Last Name', 'Email Address'])).toEqual({ name: 0, lastName: 1, email: 2 });
    expect(guessRosterMapping(['Last Name', 'Phone'])).toEqual({ phone: 1 });
  });

  it('adds new people and updates ones already on the roster by name', () => {
    const roster = [{ id: 'p1', name: 'Jane Doe', licensure: 'EMT', phone: '555-0100', eventsStaffed: 4, staffedEventIds: ['e1'] }] as RosterPerson[];
    const rows = [
      ['Jane', 'Doe', 'Paramedic', ''],
      ['Sam', 'Lee', '', 'sam@example.org'],
      ['', '', 'EMT', ''],
      ['sam', 'lee', '', ''],
    ];
    const result = rosterImport(rows, { name: 0, lastName: 1, licensure: 2, email: 3 }, roster);
    expect(result.skipped).toBe(1);
    expect(result.added).toEqual([{ name: 'Sam Lee', email: 'sam@example.org', eventsStaffed: 0 }]);
    expect(result.updated).toEqual([{ id: 'p1', fields: { name: 'Jane Doe', licensure: 'Paramedic', phone: '555-0100', eventsStaffed: 4 } }]);
  });
});
