// Team and call logs are edited as plain text (one entry per line) and
// converted back to entries on blur. Timestamps matter — the call timer
// counts from the first entry and team status timers are derived from log
// timestamps — so an edit must only stamp the lines that actually changed.

type LogEntry = { timestamp: number; message: string };

/** One line per entry, as shown in the editable log textarea. */
export function logToText(log: readonly LogEntry[] | undefined): string {
  return log && log.length > 0 ? log.map(entry => entry.message).join('\n') : '';
}

/**
 * Converts edited log text back to entries. Each non-blank line that matches
 * an existing entry's message (in order) keeps that entry, timestamp
 * included; new or edited lines are stamped with `now`. Deleted lines drop
 * out. Returns null when the text doesn't change the log, so callers can
 * skip the write.
 */
export function textToLog<T extends LogEntry>(
  text: string,
  existing: readonly T[] | undefined,
  now: number = Date.now()
): (T | LogEntry)[] | null {
  const prev = existing ?? [];
  const lines = text.split('\n').filter(line => line.trim());

  let cursor = 0;
  let changed = lines.length !== prev.length;
  const next = lines.map((line, i) => {
    // Match against the remaining existing entries in order, so reordering
    // or duplicate messages don't borrow a timestamp from elsewhere.
    for (let k = cursor; k < prev.length; k++) {
      if (prev[k].message === line) {
        if (k !== i) changed = true;
        cursor = k + 1;
        return prev[k];
      }
    }
    changed = true;
    return { timestamp: now, message: line };
  });

  return changed ? next : null;
}
