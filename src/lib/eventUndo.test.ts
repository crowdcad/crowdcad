import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { undoFor, undoPatch } from './eventUndo';

const ev = (over: Record<string, unknown>) => over as unknown as Event;

describe('eventUndo', () => {
  it('puts a changed item back, log lines included, and keeps later edits to other items', () => {
    const before = ev({ calls: [{ id: 'c1', status: 'Pending', log: [] }, { id: 'c2', status: 'Pending' }] });
    const applied = { calls: [{ id: 'c1', status: 'Assigned', log: [{ message: 'assigned' }] }, { id: 'c2', status: 'Pending' }] } as unknown as Partial<Event>;
    const undo = undoFor(before, applied)!;
    // A colleague then changes c2.
    const now = ev({ calls: [{ id: 'c1', status: 'Assigned', log: [{ message: 'assigned' }] }, { id: 'c2', status: 'Resolved' }] });
    expect(undoPatch(now, undo)).toEqual({ calls: [{ id: 'c1', status: 'Pending', log: [] }, { id: 'c2', status: 'Resolved' }] });
  });

  it('removes an added item and restores a removed one in place', () => {
    const before = ev({ staff: [{ id: 'a' }, { id: 'b' }] });
    const applied = { staff: [{ id: 'a' }, { id: 'c' }] } as unknown as Partial<Event>;
    expect(undoPatch(ev({ staff: [{ id: 'a' }, { id: 'c' }] }), undoFor(before, applied)!)).toEqual({ staff: [{ id: 'a' }, { id: 'b' }] });
  });

  it('restores plain fields and lists without ids, and never undoes MCI writes', () => {
    const before = ev({ notes: 'old', postAssignments: { '10:00': { Gate: 'Alpha' } } });
    const applied = { notes: 'new', postAssignments: {} } as unknown as Partial<Event>;
    expect(undoPatch(ev({ notes: 'new' }), undoFor(before, applied)!)).toEqual({ notes: 'old', postAssignments: { '10:00': { Gate: 'Alpha' } } });
    expect(undoFor(before, { mci: {} } as unknown as Partial<Event>)).toBeNull();
    expect(undoFor(before, {})).toBeNull();
  });

  it('empties a list the write created', () => {
    const applied = { eventEquipment: [{ id: 'e1' }] } as unknown as Partial<Event>;
    expect(undoPatch(ev({ eventEquipment: [{ id: 'e1' }] }), undoFor(ev({}), applied)!)).toEqual({ eventEquipment: [] });
  });
});
