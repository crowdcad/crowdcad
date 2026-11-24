'use client';
/**
 * The summary page's record actions, for the event's owner or an admin: export the full record as JSON
 * (#41) and place or release a legal hold (#42). Others see only whether a hold is on.
 */
import { useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { Download, Lock, LockOpen } from 'lucide-react';
import type { Event } from '@/app/types';
import { useAuth } from '@/hooks/useauth';
import { useAdmin } from '@/hooks/useAdmin';
import { useConfirmDialog } from '@/components/ui/confirmdialog';
import { downloadTextFile } from '@/lib/downloadFile';
import { exportEventRecord, setLegalHold } from '@/lib/records/client';

export default function EventRecordActions({ eventId, event, onHoldChange }: { eventId: string; event: Event; onHoldChange: (held: boolean) => void }) {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const { confirm, dialog } = useConfirmDialog();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = event.legalHold === true;
  const mayManage = !!user && (event.userId === user.uid || isAdmin);

  const exportRecord = async () => {
    setExporting(true);
    setError(null);
    try {
      const { fileName, json } = await exportEventRecord(eventId, user?.email ?? user?.uid ?? '');
      downloadTextFile(fileName, json, 'application/json;charset=utf-8');
    } catch (err) {
      console.error('Full record export failed:', err);
      setError("Couldn't export the full record.");
    } finally {
      setExporting(false);
    }
  };

  const toggleHold = () =>
    confirm(
      held
        ? {
            title: 'Release legal hold?',
            message: 'The event can then be deleted, and retention deletes it once its time has passed.',
            confirmLabel: 'Release hold',
            onConfirm: async () => {
              await setLegalHold({ id: eventId, name: event.name }, false, user?.email ?? '');
              onHoldChange(false);
            },
          }
        : {
            title: 'Place legal hold?',
            message: "Nobody can delete the event while it's held, and retention keeps it.",
            confirmLabel: 'Place hold',
            onConfirm: async () => {
              await setLegalHold({ id: eventId, name: event.name }, true, user?.email ?? '');
              onHoldChange(true);
            },
          },
    );

  return (
    <>
      {held && (
        <Chip size="sm" variant="flat" startContent={<Lock className="h-3.5 w-3.5" />} className="self-center bg-status-yellow/20 text-status-yellow" data-testid="legal-hold-chip">
          Legal hold
        </Chip>
      )}
      {mayManage && (
        <>
          <Button
            onPress={toggleHold}
            variant="flat"
            radius="lg"
            startContent={held ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            className="px-4 py-2 hover:bg-surface-liner text-surface-light font-semibold"
            data-testid="legal-hold-toggle"
          >
            {held ? 'Release Hold' : 'Legal Hold'}
          </Button>
          <Button
            onPress={exportRecord}
            isLoading={exporting}
            variant="flat"
            radius="lg"
            startContent={exporting ? null : <Download className="h-4 w-4" />}
            className="px-4 py-2 hover:bg-surface-liner text-surface-light font-semibold"
            data-testid="export-full-record"
          >
            Full Record
          </Button>
        </>
      )}
      {error && (
        <span className="self-center text-sm text-status-red" role="alert">
          {error}
        </span>
      )}
      {dialog}
    </>
  );
}
