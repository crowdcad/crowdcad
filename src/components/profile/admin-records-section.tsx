'use client';
/**
 * Profile > Admin > Records: retention (src/lib/records/retention.ts). Off until an admin turns it on;
 * then ended events are deleted that many days after they end, except those on legal hold. The purge runs
 * on the server, on the schedule the deployment sets up (docs/COMPLIANCE.md), or from here. Every change
 * and every deletion is recorded in the audit log.
 */
import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Input, Switch } from '@heroui/react';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import { useConfirmDialog } from '@/components/ui/confirmdialog';
import { DEFAULT_RECORD_SETTINGS, RETENTION_LIMITS, type RecordSettings } from '@/lib/records/retention';
import { runRetentionPurge, saveRecordSettings, subscribeRecordSettings, type PurgeReport } from '@/lib/records/client';

const SWITCH = { wrapper: 'group-data-[selected=true]:bg-accent' };

const day = (t: number) => new Date(t).toLocaleDateString();

export default function AdminRecordsSection() {
  const [settings, setSettings] = useState<RecordSettings | null>(null);
  const [on, setOn] = useState(false);
  const [daysText, setDaysText] = useState(String(RETENTION_LIMITS.suggested));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PurgeReport | null>(null);
  const [checking, setChecking] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => subscribeRecordSettings(setSettings), []);
  useEffect(() => {
    if (!settings) return;
    setOn(settings.deleteEndedAfterDays > 0);
    if (settings.deleteEndedAfterDays > 0) setDaysText(String(settings.deleteEndedAfterDays));
  }, [settings]);

  if (!settings) return null;

  const days = Number(daysText);
  const daysValid = Number.isInteger(days) && days >= RETENTION_LIMITS.min && days <= RETENTION_LIMITS.max;
  const next: RecordSettings = { deleteEndedAfterDays: on && daysValid ? days : 0 };
  const dirty = next.deleteEndedAfterDays !== settings.deleteEndedAfterDays;

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveRecordSettings(next, settings ?? DEFAULT_RECORD_SETTINGS);
      setReport(null);
      setMessage('Saved.');
    } catch {
      setError("Couldn't save the retention setting.");
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      setReport(await runRetentionPurge(true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check which events are due.");
    } finally {
      setChecking(false);
    }
  };

  const purge = () =>
    confirm({
      title: 'Delete due events?',
      message: `This permanently deletes ${report?.due.length ?? 0} ended event${report?.due.length === 1 ? '' : 's'} and everything kept for them. It can't be undone.`,
      confirmLabel: 'Delete events',
      onConfirm: async () => {
        const done = await runRetentionPurge(false);
        setReport({ ...done, due: [] });
        setMessage(`Deleted ${done.deleted} event${done.deleted === 1 ? '' : 's'}.`);
      },
    });

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40" data-testid="admin-records-section">
      <CardBody className="space-y-6 p-6">
        <div>
          <h3 className="text-xl font-semibold">Records</h3>
          <p className="mt-1 text-sm text-surface-light/70">
            How long ended events are kept is your organization&apos;s decision. Events on legal hold are never deleted. Changes and deletions are recorded in the audit log.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Delete ended events</p>
              <p className="text-sm text-surface-light/70">After the set number of days, an ended event and everything kept for it are deleted.</p>
            </div>
            <Switch isSelected={on} onValueChange={setOn} aria-label="Delete ended events" classNames={SWITCH} />
          </div>
          {on && (
            <Input
              type="number"
              label="Days after the event ends"
              min={RETENTION_LIMITS.min}
              max={RETENTION_LIMITS.max}
              value={daysText}
              onChange={(e) => setDaysText(e.target.value)}
              isInvalid={!daysValid}
              errorMessage={`Between ${RETENTION_LIMITS.min} and ${RETENTION_LIMITS.max} days.`}
              classNames={FIELD_CLASSNAMES}
              className="max-w-xs"
              data-testid="retention-days"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onPress={save} isLoading={saving} isDisabled={!dirty || (on && !daysValid)} className="bg-accent text-accent-foreground" data-testid="retention-save">
            Save changes
          </Button>
          {message && !dirty && <span className="text-sm text-surface-light/70">{message}</span>}
        </div>

        {settings.deleteEndedAfterDays > 0 && (
          <div className="space-y-3 border-t border-default-200 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Due now</p>
                <p className="text-sm text-surface-light/70">Your deployment&apos;s schedule deletes these. You can also delete them now.</p>
              </div>
              <Button variant="bordered" onPress={check} isLoading={checking} data-testid="retention-check">
                Check
              </Button>
            </div>
            {report && (
              <div className="space-y-2 text-sm" data-testid="retention-report">
                {report.due.length === 0 ? (
                  <p className="text-surface-light/70">No events are due.</p>
                ) : (
                  <ul className="space-y-1">
                    {report.due.map((e) => (
                      <li key={e.id}>
                        {e.name || e.id} <span className="text-surface-light/60">· ended {day(e.endedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {report.held.length > 0 && (
                  <p className="text-surface-light/70">
                    {report.held.length} more {report.held.length === 1 ? 'is' : 'are'} on legal hold and kept.
                  </p>
                )}
                {report.due.length > 0 && (
                  <Button onPress={purge} className="bg-status-red text-white" data-testid="retention-purge">
                    Delete {report.due.length} event{report.due.length === 1 ? '' : 's'} now
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-status-red" role="alert">
            {error}
          </p>
        )}
      </CardBody>
      {dialog}
    </Card>
  );
}
