'use client';

import { useMemo, useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Switch,
} from '@heroui/react';
import type { Event } from '@/app/types';
import {
  DEFAULT_EXPORT_OPTIONS,
  buildDetailRows,
  buildSummaryRows,
  buildExportFilename,
  toCsv,
  type ExportLogOptions,
} from '@/lib/exportLog';
import { downloadTextFile } from '@/lib/downloadFile';
import { STATIC_CLOSE_BUTTON_CLASS } from '@/lib/heroStatic';

export interface ExportLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
}

const switchClassNames = { wrapper: 'group-data-[selected=true]:bg-accent' } as const;

function ToggleRow({
  label,
  description,
  isSelected,
  onValueChange,
  disabled,
}: {
  label: string;
  description: string;
  isSelected: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={['flex items-center justify-between gap-4 py-3', disabled ? 'opacity-40' : ''].join(' ')}>
      <div>
        <div className="text-surface-light text-sm font-medium">{label}</div>
        <div className="text-surface-light/60 text-xs mt-0.5">{description}</div>
      </div>
      <Switch
        isSelected={isSelected}
        onValueChange={onValueChange}
        isDisabled={disabled}
        aria-label={label}
        classNames={switchClassNames}
      />
    </div>
  );
}

export default function ExportLogModal({ isOpen, onClose, event }: ExportLogModalProps) {
  const [options, setOptions] = useState<ExportLogOptions>(DEFAULT_EXPORT_OPTIONS);

  function updateOption<K extends keyof ExportLogOptions>(key: K, value: ExportLogOptions[K]) {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }

  const isSummary = options.variant === 'summary';

  const preview = useMemo(() => {
    if (isSummary) return 'Aggregate counts only, no per-call rows.';
    const omissions: string[] = [];
    if (!options.includeNotes) omissions.push('notes');
    if (!options.includeTeam) omissions.push('team names');
    if (omissions.length === 0) return '';
    return `Will not include ${omissions.join(' or ')}.`;
  }, [isSummary, options.includeNotes, options.includeTeam]);

  function handleExport() {
    const rows = isSummary ? buildSummaryRows(event) : buildDetailRows(event, options);
    const csv = toCsv(rows);
    downloadTextFile(buildExportFilename(event.name, options.variant), csv, 'text/csv;charset=utf-8;');
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      placement="center"
      backdrop="opaque"
      radius="lg"
      classNames={{
        base: 'rounded-lg bg-surface-deepest text-surface-light max-w-lg w-full',
        header: 'pb-0',
        body: 'py-4',
        footer: 'pt-0',
        closeButton: STATIC_CLOSE_BUTTON_CLASS,
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Export Anonymized Event Log
        </ModalHeader>
        <ModalBody>
          <div className="rounded-large border border-surface-liner divide-y divide-surface-liner px-4">
            <ToggleRow
              label="Aggregate summary only"
              description="Export totals and breakdowns instead of one row per call."
              isSelected={isSummary}
              onValueChange={(v) => updateOption('variant', v ? 'summary' : 'detail')}
            />
          </div>

          <div className="rounded-large border border-surface-liner divide-y divide-surface-liner px-4 mt-3">
            <ToggleRow
              label="Bucket patient ages"
              description="Replace exact ages with ranges (e.g. 18-25)."
              isSelected={options.ageMode === 'bucketed'}
              onValueChange={(v) => updateOption('ageMode', v ? 'bucketed' : 'exact')}
              disabled={isSummary}
            />
            <ToggleRow
              label="Round call times"
              description={`Round timestamps to the nearest ${options.roundingMinutes} minutes.`}
              isSelected={options.timeMode === 'rounded'}
              onValueChange={(v) => updateOption('timeMode', v ? 'rounded' : 'exact')}
              disabled={isSummary}
            />
            <ToggleRow
              label="Generalize locations to zone"
              description="Show the dispatch zone instead of the exact post or location."
              isSelected={options.locationMode === 'zone'}
              onValueChange={(v) => updateOption('locationMode', v ? 'zone' : 'exact')}
              disabled={isSummary}
            />
            <ToggleRow
              label="Exclude notes"
              description="Leave free-text call notes out of the export."
              isSelected={!options.includeNotes}
              onValueChange={(v) => updateOption('includeNotes', !v)}
              disabled={isSummary}
            />
            <ToggleRow
              label="Exclude team assignments"
              description="Leave out assigned team and transport unit."
              isSelected={!options.includeTeam}
              onValueChange={(v) => updateOption('includeTeam', !v)}
              disabled={isSummary}
            />
          </div>

          {preview && <p className="text-surface-light/60 text-xs mt-3">{preview}</p>}
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2">
          <Button
            onPress={onClose}
            className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
            variant="bordered"
            radius="lg"
          >
            Cancel
          </Button>
          <Button
            onPress={handleExport}
            radius="lg"
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
          >
            Export CSV
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
