import { describe, expect, it } from 'vitest';
import { parseRecordSettings, purgeDueAt, purgeVerdict, RETENTION_LIMITS } from './retention';

const DAY = 86_400_000;

describe('parseRecordSettings', () => {
  it('is off for a missing or malformed record', () => {
    expect(parseRecordSettings(null)).toEqual({ deleteEndedAfterDays: 0 });
    expect(parseRecordSettings({ value: { deleteEndedAfterDays: 'x' } })).toEqual({ deleteEndedAfterDays: 0 });
    expect(parseRecordSettings({ value: { deleteEndedAfterDays: -3 } })).toEqual({ deleteEndedAfterDays: 0 });
  });

  it('rounds down and caps the days', () => {
    expect(parseRecordSettings({ value: { deleteEndedAfterDays: 30.9 } })).toEqual({ deleteEndedAfterDays: 30 });
    expect(parseRecordSettings({ value: { deleteEndedAfterDays: 99999 } })).toEqual({ deleteEndedAfterDays: RETENTION_LIMITS.max });
  });
});

describe('purge verdict', () => {
  const settings = { deleteEndedAfterDays: 30 };
  const endedAt = Date.UTC(2026, 0, 1);

  it('keeps everything while retention is off', () => {
    expect(purgeVerdict({ ended: true, endedAt }, { deleteEndedAfterDays: 0 }, endedAt + 1000 * DAY)).toBe('keep');
  });

  it('keeps events that have not ended, or have no end time', () => {
    expect(purgeVerdict({ ended: false, endedAt }, settings, endedAt + 100 * DAY)).toBe('keep');
    expect(purgeVerdict({ ended: true }, settings, endedAt + 100 * DAY)).toBe('keep');
  });

  it('is due once the days have passed, not before', () => {
    expect(purgeDueAt({ ended: true, endedAt }, settings)).toBe(endedAt + 30 * DAY);
    expect(purgeVerdict({ ended: true, endedAt }, settings, endedAt + 30 * DAY - 1)).toBe('keep');
    expect(purgeVerdict({ ended: true, endedAt }, settings, endedAt + 30 * DAY)).toBe('due');
  });

  it('never purges an event on legal hold', () => {
    expect(purgeVerdict({ ended: true, endedAt, legalHold: true }, settings, endedAt + 365 * DAY)).toBe('held');
  });
});
