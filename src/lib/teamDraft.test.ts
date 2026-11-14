import { describe, expect, it } from 'vitest';
import { newSupervisor, supervisorMemberString } from './teamDraft';

describe('supervisorMemberString', () => {
  it('appends the certification in brackets', () => {
    expect(supervisorMemberString('Alex', 'EMT')).toBe('Alex [EMT]');
  });

  it('is just the name when no certification is given', () => {
    expect(supervisorMemberString('Alex', '')).toBe('Alex');
    expect(supervisorMemberString(' Alex ', '  ')).toBe('Alex');
  });
});

describe('newSupervisor', () => {
  it('needs no certification', () => {
    const s = newSupervisor('SUP-1', '', '');
    expect(s.team).toBe('SUP-1');
    expect(s.member).toBe('SUP-1');
  });

  it('keeps a certification when given', () => {
    expect(newSupervisor('SUP-1', 'Alex', 'Paramedic').member).toBe('Alex [Paramedic]');
  });
});
