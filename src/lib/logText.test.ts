import { describe, expect, it } from 'vitest';
import { logToText, sortedLog, textToLog } from './logText';

describe('team and call logs as text', () => {
  const log = [
    { timestamp: 3, message: '12:03 - Status: Busy' },
    { timestamp: 1, message: '12:01 - Team created' },
    { timestamp: 2, message: '12:02 - Post changed to Gate' },
  ];

  it('shows entries in time order', () => {
    expect(logToText(sortedLog(log))).toBe('12:01 - Team created\n12:02 - Post changed to Gate\n12:03 - Status: Busy');
  });

  it('keeps every timestamp when sorted text comes back unchanged or with a line added', () => {
    const sorted = sortedLog(log);
    expect(textToLog(logToText(sorted), sorted)).toBeNull();
    const next = textToLog(`${logToText(sorted)}\n12:09 - Note`, sorted, 9)!;
    expect(next.map((e) => e.timestamp)).toEqual([1, 2, 3, 9]);
  });
});
