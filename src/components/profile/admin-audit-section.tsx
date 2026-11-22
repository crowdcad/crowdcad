'use client';
/**
 * Profile > Admin > Audit log: the last 30 days of the append-only
 * audit log (src/lib/services/audit.ts), newest first, searchable. Read-only:
 * nobody can edit or delete a row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, Input, Spinner } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import { auditLog, type AuditEntry } from '@/lib/services';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

type Row = AuditEntry & { id: string };

function when(t: number): string {
  return new Date(t).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AdminAuditSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');

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

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40" data-testid="admin-audit-section">
      <CardBody className="p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Audit log</h3>
          <Button isIconOnly size="sm" radius="full" variant="light" onPress={load} isDisabled={loading} aria-label="Refresh audit log">
            <RefreshCw className="h-4 w-4" />
          </Button>
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
          <div className="max-h-96 overflow-y-auto pr-2">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-deep text-xs uppercase tracking-wide text-surface-light/60">
                <tr>
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Who</th>
                  <th className="py-2 pr-3 font-semibold">Action</th>
                  <th className="py-2 font-semibold">On</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-default-200 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-surface-light/70">{when(r.t)}</td>
                    <td className="py-2 pr-3">{r.actor}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">{r.action}</td>
                    <td className="py-2 text-surface-light/80">
                      {[r.target, r.detail].filter(Boolean).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
