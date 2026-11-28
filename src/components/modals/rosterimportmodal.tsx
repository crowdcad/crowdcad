'use client';
/**
 * Import a roster from a CSV file: choose the file, check which of its columns fills each roster field (guessed
 * from its headers, src/lib/rosterCsv.ts), and import. Names already on the roster update those people.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
import { Upload } from '@/components/ui/icons';
import { saveRosterPerson, type RosterPerson } from '@/lib/roster';
import { guessRosterMapping, parseCsv, ROSTER_IMPORT_FIELDS, rosterImport, type RosterImportField, type RosterMapping } from '@/lib/rosterCsv';

const SKIP = 'skip';

export default function RosterImportModal({ isOpen, onClose, roster, onImported }: { isOpen: boolean; onClose: () => void; roster: RosterPerson[]; onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<RosterMapping>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const headers = rows[0] ?? [];
  const body = rows.slice(1);
  const plan = useMemo(() => (mapping.name === undefined ? null : rosterImport(body, mapping, roster)), [body, mapping, roster]);

  const reset = () => {
    setFileName('');
    setRows([]);
    setMapping({});
    setError('');
  };
  const close = () => {
    reset();
    onClose();
  };
  const read = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setError('The file needs a header row and at least one person.');
      return;
    }
    setRows(parsed);
    setMapping(guessRosterMapping(parsed[0]!));
  };
  const pick = (field: RosterImportField, value: string) =>
    setMapping((m) => {
      const next: RosterMapping = { ...m };
      if (value === SKIP) delete next[field];
      else {
        const col = Number(value);
        // A column fills one field: taking it here frees it elsewhere.
        for (const k of Object.keys(next) as RosterImportField[]) if (next[k] === col) delete next[k];
        next[field] = col;
      }
      return next;
    });
  const run = async () => {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      await Promise.all([...plan.added.map((f) => saveRosterPerson(null, f)), ...plan.updated.map((u) => saveRosterPerson(u.id, u.fields))]);
      onImported();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  };
  const sample = (col: number | undefined) => (col === undefined ? '' : (body.find((r) => r[col]?.trim())?.[col] ?? ''));

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && close()} placement="top-center" backdrop="opaque" hideCloseButton radius="lg" size="2xl" classNames={{ base: 'rounded-lg bg-surface-deepest text-surface-light mt-20' }}>
      <ModalContent data-testid="roster-import">
        <ModalHeader className="text-2xl font-bold text-surface">Import roster</ModalHeader>
        <ModalBody className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" radius="full" variant="flat" startContent={<Upload className="h-4 w-4" />} onPress={() => fileInput.current?.click()}>
              Choose CSV file
            </Button>
            <span className="truncate text-sm text-surface-light/70">{fileName || 'No file selected'}</span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = '';
              }}
              data-testid="roster-import-file"
            />
          </div>
          {error && <p className="text-sm text-status-red">{error}</p>}
          {headers.length > 0 && (
            <>
              <div className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-surface-faint">Roster</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-surface-faint">CSV column</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-surface-faint">First value</span>
                {ROSTER_IMPORT_FIELDS.map((f) => (
                  <React.Fragment key={f.key}>
                    <span>{f.label}</span>
                    <Select
                      aria-label={`CSV column for ${f.label}`}
                      size="sm"
                      radius="lg"
                      selectedKeys={new Set([mapping[f.key] === undefined ? SKIP : String(mapping[f.key])])}
                      disallowEmptySelection
                      onSelectionChange={(keys) => {
                        const v = Array.from(keys as Set<string>)[0];
                        if (v) pick(f.key, v);
                      }}
                      items={[{ key: SKIP, label: "Don't import" }, ...headers.map((h, i) => ({ key: String(i), label: h.trim() || `Column ${i + 1}` }))]}
                      data-testid={`roster-import-map-${f.key}`}
                    >
                      {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
                    </Select>
                    <span className="truncate text-surface-faint">{sample(mapping[f.key])}</span>
                  </React.Fragment>
                ))}
              </div>
              <p className="text-sm text-surface-light/80" data-testid="roster-import-summary">
                {!plan
                  ? 'Choose the column with names.'
                  : `${plan.added.length} new, ${plan.updated.length} already on the roster (updated)${plan.skipped ? `, ${plan.skipped} without a name (skipped)` : ''}.`}
              </p>
            </>
          )}
        </ModalBody>
        <ModalFooter className="flex justify-end gap-2">
          <Button onPress={close} className="border border-status-red px-4 py-2 text-status-red hover:bg-status-red/10" variant="bordered" radius="lg">
            Cancel
          </Button>
          <Button
            radius="lg"
            className="bg-accent px-4 py-2 text-surface-light hover:bg-accent/90"
            isDisabled={!plan || !(plan.added.length + plan.updated.length)}
            isLoading={busy}
            onPress={() => void run()}
            data-testid="roster-import-confirm"
          >
            {plan ? `Import ${plan.added.length + plan.updated.length}` : 'Import'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
