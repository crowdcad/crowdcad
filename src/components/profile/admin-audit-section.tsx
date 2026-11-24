'use client';
/**
 * Profile > Admin > Audit log: the last 30 days of the append-only
 * audit log (src/lib/services/audit.ts), newest first, searchable. Read-only:
 * nobody can edit or delete a row. The list scrolls inside the card, adding
 * rows as you reach the end; Export CSV saves every row the search matches
 * (and records that it did).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, CardBody, Input, Spinner } from '@heroui/react';
import { Download, RefreshCw } from 'lucide-react';
import { auditCsv, auditLog, type AuditEntry } from '@/lib/services';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import { downloadTextFile } from '@/lib/downloadFile';
import { PROFILE_ACTION_BUTTON } from './buttonStyles';

type Row = AuditEntry & { id: string };

/** Rows shown at first, and added each time the list is scrolled to its end. */
const PAGE = 100;

function when(t: number): string {
  return new Date(t).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AdminAuditSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setRows(await auditLog.recent(30));
    } catch (err) {
      console.error('Could not load the audit log', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.actor, r.action, r.target, r.eventId, r.detail].some((v) => v?.toLowerCase().includes(q)));
  }, [rows, search]);

  // A new search or a reload starts again at the top.
  useEffect(() => {
    setShown(PAGE);
    listRef.current?.scrollTo({ top: 0 });
  }, [filtered]);

  const visible = filtered.slice(0, shown);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (shown < filtered.length && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) setShown((n) => n + PAGE);
  };

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`CrowdCAD_Audit_Log_${date}.csv`, auditCsv(filtered), 'text/csv;charset=utf-8');
    void auditLog.record({ action: 'audit.export', detail: `${filtered.length} rows${search.trim() ? ', filtered' : ''}` });
  };

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40" data-testid="admin-audit-section">
      <CardBody className="p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-semibold">Audit log</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="bordered"
              size="md"
              radius="lg"
              className={PROFILE_ACTION_BUTTON}
              startContent={<Download className="h-4 w-4" />}
              onPress={exportCsv}
              isDisabled={loading || failed || filtered.length === 0}
              data-testid="audit-export-csv"
            >
              Export CSV
            </Button>
            <Button isIconOnly size="sm" radius="full" variant="light" onPress={load} isDisabled={loading} aria-label="Refresh audit log">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-surface-light/70">
          Sign-ins, exports, sharing, admin and event changes from the last 30 days. Entries can&apos;t be edited or deleted.
        </p>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by person, action, event or detail"
          aria-label="Search the audit log"
          classNames={FIELD_CLASSNAMES}
          className="mb-4"
        />

        {loading ? (
          <Spinner size="sm" classNames={{ circle1: 'border-b-accent', circle2: 'border-b-accent' }} />
        ) : failed ? (
          <p className="text-sm text-status-red" role="alert">
            The audit log couldn&apos;t be loaded.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-surface-light/70">No entries.</p>
        ) : (
          <>
            <div
              ref={listRef}
              onScroll={onScroll}
              className="max-h-[28rem] overflow-auto overscroll-contain rounded border border-default-200"
              tabIndex={0}
              role="region"
              aria-label="Audit log entries"
              data-testid="audit-log-list"
            >
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 hidden bg-surface-deep text-xs text-surface-light/60 sm:table-header-group">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Who</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">On</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    // On a phone each entry stacks into lines; from sm up it's a table row.
                    <tr key={r.id} className="block border-t border-default-200 px-3 py-2 first:border-t-0 sm:table-row sm:p-0 sm:first:border-t">
                      <td className="block text-xs tabular-nums text-surface-light/70 sm:table-cell sm:whitespace-nowrap sm:px-3 sm:py-2 sm:align-top">
                        {when(r.t)}
                        <span className="sm:hidden"> · {r.action}</span>
                      </td>
                      <td className="block break-words sm:table-cell sm:px-3 sm:py-2 sm:align-top">{r.actor}</td>
                      <td className="hidden whitespace-nowrap text-xs sm:table-cell sm:px-3 sm:py-2 sm:align-top">{r.action}</td>
                      <td className="block break-words text-surface-light/80 sm:table-cell sm:px-3 sm:py-2 sm:align-top">
                        {[r.target, r.detail].filter(Boolean).join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-surface-light/60" data-testid="audit-log-count">
              {visible.length < filtered.length
                ? `Showing ${visible.length} of ${filtered.length} entries. Scroll for more.`
                : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
