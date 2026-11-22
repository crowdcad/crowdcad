'use client';
/**
 * Lite mode's storage notice and the events kept in this browser.
 *
 * Lite events live only in this browser's IndexedDB (localStorage as a
 * fallback, src/lib/liteEventStore.ts) and are never sent anywhere, so the
 * person using Lite holds them. This makes that plain and lets them reopen or
 * delete every event stored here, including ones from earlier visits that
 * nothing else lists.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { deleteLiteEvent, listLiteEvents, type LiteEventDraft } from '@/lib/liteEventStore';
import { useConfirmDialog } from '@/components/ui/confirmdialog';

/** Shown wherever Lite takes data in. */
export function LiteStorageNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-surface-faint ${className}`} data-testid="lite-storage-notice">
      Lite keeps everything in this browser on this device. It&apos;s never sent to CrowdCAD, and you&apos;re responsible
      for it: who uses this device, exporting it and deleting it. Clearing your browser data deletes it for good.
    </p>
  );
}

function openHref(event: LiteEventDraft): string {
  return event.status === 'active' ? `/lite/events/${event.id}/dispatch` : `/lite/create?eventId=${event.id}`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function LiteStoredEvents() {
  const [events, setEvents] = useState<LiteEventDraft[] | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const reload = useCallback(async () => {
    try {
      setEvents(await listLiteEvents());
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!events || events.length === 0) return dialog;

  const remove = (event: LiteEventDraft) =>
    confirm({
      title: 'Delete from this browser?',
      message: `“${event.name || 'Untitled event'}” and all its logs will be deleted from this browser. It can't be recovered.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await deleteLiteEvent(event.id);
        await reload();
      },
    });

  const removeAll = () =>
    confirm({
      title: 'Delete all Lite events?',
      message: `All ${events.length} events stored in this browser and their logs will be deleted. They can't be recovered.`,
      confirmLabel: 'Delete all',
      onConfirm: async () => {
        for (const e of events) await deleteLiteEvent(e.id);
        await reload();
      },
    });

  return (
    <section className="flex w-full flex-col gap-2" aria-labelledby="lite-stored-heading" data-testid="lite-stored-events">
      <div className="flex items-center justify-between gap-2">
        <h2 id="lite-stored-heading" className="text-sm font-semibold text-surface-light">
          Stored in this browser
        </h2>
        {events.length > 1 && (
          <Button size="sm" variant="light" className="text-status-red" onPress={removeAll} data-testid="lite-delete-all">
            Delete all
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-surface-liner border border-surface-liner">
        {events.map((event) => (
          <li key={event.id} className="flex items-center gap-2 px-3 py-2">
            <Link href={openHref(event)} className="min-w-0 flex-1 text-surface-light hover:text-accent">
              <span className="block truncate text-sm font-semibold">{event.name || 'Untitled event'}</span>
              <span className="block text-xs text-surface-faint">
                {event.status === 'active' ? 'Running' : 'Setting up'} · updated {when(event.updatedAt)}
              </span>
            </Link>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={`Delete ${event.name || 'untitled event'} from this browser`}
              onPress={() => remove(event)}
              data-testid="lite-delete-event"
            >
              <Trash2 className="h-4 w-4 text-status-red" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {dialog}
    </section>
  );
}
