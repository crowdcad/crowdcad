'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea } from '@heroui/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useauth';
import { useAdmin } from '@/hooks/useAdmin';
import { useCertifications } from '@/hooks/useCertifications';
import LoadingScreen from '@/components/ui/loading-screen';
import FormModal from '@/components/modals/formmodal';
import { useConfirmDialog } from '@/components/ui/confirmdialog';
import { LIST_SEARCH_CLASSNAMES, MODAL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import { deleteRosterPerson, listRoster, saveRosterPerson, type RosterFields, type RosterPerson } from '@/lib/roster';

const EMPTY: RosterFields = { name: '', licensure: '', eventsStaffed: 0, region: '', email: '', phone: '', notes: '' };

/** The organization's staff roster: admins only (src/lib/roster.ts). */
export default function RosterPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { certifications } = useCertifications();
  const { confirm, dialog } = useConfirmDialog();
  const [people, setPeople] = useState<RosterPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; fields: RosterFields } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && !user) {
      sessionStorage.setItem('redirectPath', '/roster');
      router.push('/?login=true&error=auth');
    }
  }, [user, ready, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPeople(await listRoster());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => [p.name, p.licensure, p.region, p.email, p.phone, p.notes].some((v) => v?.toLowerCase().includes(q)));
  }, [people, search]);

  if (!ready || adminLoading) return <LoadingScreen label="Loading…" />;
  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-surface-deepest px-6 text-surface-light">
        <p>The roster is available to administrators.</p>
      </main>
    );
  }

  const set = (patch: Partial<RosterFields>) => setEditing((e) => (e ? { ...e, fields: { ...e.fields, ...patch } } : e));
  const save = async () => {
    if (!editing) return;
    if (!editing.fields.name.trim()) {
      setError('Enter a name.');
      return;
    }
    await saveRosterPerson(editing.id, editing.fields);
    setEditing(null);
    await load();
  };
  const remove = (p: RosterPerson) =>
    confirm({
      title: 'Remove from roster?',
      message: `Remove ${p.name} from the roster? Events they staffed are not changed.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        await deleteRosterPerson(p.id);
        setPeople((all) => all.filter((x) => x.id !== p.id));
      },
    });
  const open = (p?: RosterPerson) => {
    setError('');
    setEditing(
      p
        ? { id: p.id, fields: { name: p.name, licensure: p.licensure ?? '', eventsStaffed: p.eventsStaffed ?? 0, region: p.region ?? '', email: p.email ?? '', phone: p.phone ?? '', notes: p.notes ?? '' } }
        : { id: null, fields: { ...EMPTY } }
    );
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-surface-deepest px-4 pb-10 pt-8 text-surface-light md:px-8">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Roster</h1>
            <p className="text-surface-faint">{people.length} {people.length === 1 ? 'person' : 'people'}</p>
          </div>
          <Button radius="lg" className="bg-accent text-surface-light" startContent={<Plus className="h-4 w-4" />} onPress={() => open()} data-testid="roster-add">
            Add person
          </Button>
        </div>
        <Input value={search} onValueChange={setSearch} placeholder="Search name, licensure, region, contact or notes" classNames={LIST_SEARCH_CLASSNAMES} aria-label="Search the roster" />

        {loading ? (
          <p className="text-surface-faint">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-surface-faint">{people.length ? 'No one matches.' : 'No one on the roster yet.'}</p>
        ) : (
          <div className="overflow-x-auto border border-surface-liner" data-testid="roster-list">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-surface-deep text-xs uppercase tracking-wider text-surface-faint">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Licensure</th>
                  <th className="px-3 py-2 text-right font-semibold">Events</th>
                  <th className="px-3 py-2 font-semibold">City / region</th>
                  <th className="px-3 py-2 font-semibold">Contact</th>
                  <th className="px-3 py-2 font-semibold">Notes</th>
                  <th className="w-20 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-t border-surface-liner hover:bg-surface-deep/60" data-testid="roster-row">
                    <td className="px-3 py-2 text-base font-semibold">{p.name}</td>
                    <td className="px-3 py-2">{p.licensure}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.eventsStaffed ?? 0}</td>
                    <td className="px-3 py-2">{p.region}</td>
                    <td className="px-3 py-2">
                      {p.email && (
                        <a className="block text-accent" href={`mailto:${p.email}`}>
                          {p.email}
                        </a>
                      )}
                      {p.phone && (
                        <a className="block text-accent" href={`tel:${p.phone}`}>
                          {p.phone}
                        </a>
                      )}
                    </td>
                    <td className="max-w-[18rem] px-3 py-2 text-surface-faint">
                      <span className="line-clamp-2" title={p.notes}>
                        {p.notes}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button isIconOnly size="sm" variant="light" aria-label={`Edit ${p.name}`} onPress={() => open(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button isIconOnly size="sm" variant="light" className="text-surface-faint hover:text-status-red" aria-label={`Remove ${p.name}`} onPress={() => remove(p)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormModal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit person' : 'Add person'} onSubmit={save} formTestId="roster-form">
        {editing && (
          <div className="flex flex-col gap-3">
            <Input label="Name" isRequired autoFocus classNames={MODAL_FIELD_CLASSNAMES} value={editing.fields.name} onValueChange={(name) => set({ name })} isInvalid={!!error} errorMessage={error} maxLength={80} data-testid="roster-name" />
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
              <Input label="Licensure" list="roster-licensure" classNames={MODAL_FIELD_CLASSNAMES} value={editing.fields.licensure} onValueChange={(licensure) => set({ licensure })} maxLength={40} data-testid="roster-licensure" />
              <Input label="Events staffed" type="number" min={0} classNames={MODAL_FIELD_CLASSNAMES} value={String(editing.fields.eventsStaffed ?? 0)} onValueChange={(v) => set({ eventsStaffed: Number(v) || 0 })} />
            </div>
            <datalist id="roster-licensure">
              {certifications.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Input label="City / region" classNames={MODAL_FIELD_CLASSNAMES} value={editing.fields.region} onValueChange={(region) => set({ region })} maxLength={80} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Email" type="email" classNames={MODAL_FIELD_CLASSNAMES} value={editing.fields.email} onValueChange={(email) => set({ email })} maxLength={120} />
              <Input label="Phone" type="tel" classNames={MODAL_FIELD_CLASSNAMES} value={editing.fields.phone} onValueChange={(phone) => set({ phone })} maxLength={40} />
            </div>
            <Textarea label="Notes" classNames={MODAL_FIELD_CLASSNAMES} value={editing.fields.notes} onValueChange={(notes) => set({ notes })} maxLength={1000} minRows={2} />
          </div>
        )}
      </FormModal>
      {dialog}
    </main>
  );
}
