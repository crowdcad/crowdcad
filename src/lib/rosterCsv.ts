import { cleanRosterFields, findRosterPerson, type RosterFields, type RosterPerson } from '@/lib/roster';

/**
 * Roster import from a CSV file (the Roster page's Import CSV): the file's rows, which of its columns goes to
 * each roster field (guessed from the headers, then chosen by the admin), and the people that makes. Pure.
 */

/** Roster fields a column can fill. `lastName` joins `name` when a file keeps first and last names apart. */
export type RosterImportField = 'name' | 'lastName' | 'licensure' | 'eventsStaffed' | 'region' | 'email' | 'phone' | 'notes';

export const ROSTER_IMPORT_FIELDS: { key: RosterImportField; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'lastName', label: 'Last name (if separate)' },
  { key: 'licensure', label: 'Licensure' },
  { key: 'eventsStaffed', label: 'Events staffed' },
  { key: 'region', label: 'City / region' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
];

/** Column index per field; a field left out isn't imported. */
export type RosterMapping = Partial<Record<RosterImportField, number>>;

/** Rows of a CSV file: quoted fields (with commas, quotes as "" and line breaks), CRLF or LF. Blank rows dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

// Words in a header that point to a field, strongest first. Checked in this order, so "First name" goes to
// name before "name" alone could, and "Email" isn't taken by Phone's "mail"-less words.
const KEYWORDS: [RosterImportField, RegExp][] = [
  ['email', /e-?mail/],
  ['phone', /phone|mobile|cell|tel\b|telephone|sms/],
  ['lastName', /last|surname|family/],
  ['name', /first|given|full name|^name$|name|person|member|staff/],
  ['licensure', /licen|cert|credential|qualif|level|provider type/],
  ['eventsStaffed', /events|staffed|shifts|count/],
  ['region', /city|region|area|county|town|location|state|zip/],
  ['notes', /note|comment|remark/],
];

/** A first guess at which column fills which field, from the header row. Each column is used once. */
export function guessRosterMapping(headers: string[]): RosterMapping {
  const mapping: RosterMapping = {};
  const used = new Set<number>();
  for (const [field, re] of KEYWORDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(h.trim().toLowerCase()));
    if (i >= 0) {
      mapping[field] = i;
      used.add(i);
    }
  }
  // A last-name column means the "name" one is a first name; without a name column it means nothing.
  if (mapping.lastName !== undefined && mapping.name === undefined) delete mapping.lastName;
  return mapping;
}

export interface RosterImport {
  /** People to add. */
  added: RosterFields[];
  /** People already on the roster (by name), with the file's non-empty values. */
  updated: { id: string; fields: RosterFields }[];
  /** Rows without a name. */
  skipped: number;
}

/** The roster changes a file's rows make (without its header row). A name already on the roster updates that person. */
export function rosterImport(rows: string[][], mapping: RosterMapping, roster: RosterPerson[]): RosterImport {
  const out: RosterImport = { added: [], updated: [], skipped: 0 };
  const cell = (row: string[], field: RosterImportField) => (mapping[field] === undefined ? '' : (row[mapping[field]!] ?? '').trim());
  const seen = new Set<string>();
  for (const row of rows) {
    const name = [cell(row, 'name'), cell(row, 'lastName')].filter(Boolean).join(' ');
    if (!name) {
      out.skipped++;
      continue;
    }
    const raw: RosterFields = { name };
    for (const key of ['licensure', 'region', 'email', 'phone', 'notes'] as const) {
      const v = cell(row, key);
      if (v) raw[key] = v;
    }
    const events = cell(row, 'eventsStaffed');
    if (events) raw.eventsStaffed = Number(events.replace(/[^\d]/g, '')) || 0;
    const fields = cleanRosterFields(raw);
    // The file's own repeats: the first one counts.
    const key = fields.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = findRosterPerson(roster, fields.name);
    if (existing) {
      const current: RosterFields = { name: existing.name };
      for (const k of ['licensure', 'region', 'email', 'phone', 'notes'] as const) if (existing[k]) current[k] = existing[k];
      current.eventsStaffed = existing.eventsStaffed ?? 0;
      const id = existing.id;
      // Values the file leaves empty keep what the roster has; events staffed only when the file has a column for it.
      out.updated.push({ id, fields: { ...current, ...Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== '' && (k !== 'eventsStaffed' || events))) } as RosterFields });
    } else out.added.push(fields);
  }
  return out;
}
