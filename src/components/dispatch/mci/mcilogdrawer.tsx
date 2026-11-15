// How an MCI log entry reads, for the dispatch Log view and the role views.
import type { Event, MciLogEntry } from '@/app/types';
import { mciAllAreas, mciAllZones, mciPatientLabel } from '@/lib/mci';
import { MCI_COLOR_STYLES } from './mciparts';

/** "1 red (34 M chest pain)" for an entry about one patient. */
function patientText(mci: NonNullable<Event['mci']>, entry: MciLogEntry, color: string): string {
  const label = mciPatientLabel(entry.patientId ? mci.patients?.[entry.patientId] : undefined);
  return `1 ${color}${label ? ` (${label})` : ''}`;
}

/** One log line in words, e.g. "Zone A: +3 red tagged" or "Zone A: 2 yellow moved to Clinic". */
export function describeMciEntry(mci: NonNullable<Event['mci']>, entry: MciLogEntry): string {
  const zone = mciAllZones(mci).find((z) => z.id === entry.zoneId)?.name ?? 'Zone';
  const area = mciAllAreas(mci).find((a) => a.id === entry.areaId)?.name ?? 'treatment';
  const color = entry.color ? MCI_COLOR_STYLES[entry.color].label.toLowerCase() : '';
  switch (entry.kind) {
    case 'tagged':
      return `${zone}: ${(entry.n ?? 0) > 0 ? '+' : ''}${entry.n} ${color} tagged`;
    case 'moved':
      return `${zone}: ${entry.n} ${color} moved to ${area}`;
    case 'arrived':
      return `${area}: ${entry.n} ${color} walk-in`;
    case 'reassigned': {
      const changes = [
        entry.toColor ? `retriaged ${color} to ${MCI_COLOR_STYLES[entry.toColor].label.toLowerCase()}` : '',
        entry.toAreaId ? `moved to ${mciAllAreas(mci).find((a) => a.id === entry.toAreaId)?.name ?? 'treatment'}` : '',
      ].filter(Boolean);
      return `${area}: ${patientText(mci, entry, color)} ${changes.join(', ')}${entry.note ? ` (${entry.note})` : ''}`;
    }
    case 'transported': {
      const who = entry.patientId ? patientText(mci, entry, color) : `${entry.n} ${color}`;
      return `${area}: ${who} transported${entry.unit ? ` in ${entry.unit}` : ''}${entry.destination ? ` to ${entry.destination}` : ''}`;
    }
    case 'zone_cleared':
      return `${zone}: marked clear`;
    case 'zone_reopened':
      return `${zone}: reopened`;
    case 'noted':
      return entry.note ?? '';
    case 'undo': {
      const target = mci.log.find((e) => e.id === entry.undoes);
      return `Undid: ${target ? describeMciEntry(mci, target) : 'an earlier entry'}`;
    }
  }
}
