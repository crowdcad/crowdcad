'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, Select, SelectItem, Input, Button } from '@heroui/react';
import { Check, Circle, Pencil, Trash2 } from 'lucide-react';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import {
  DISPATCH_TERMS,
  DISPATCH_TERM_CATEGORY_LABELS,
  type DispatchTermCategory,
} from '@/lib/dispatchVocabulary/terms';
import { PROFILE_ACTION_BUTTON } from './buttonStyles';

const BLANK_TEMPLATE_ID = '__blank__';

const inputClassNames = {
  label: 'text-surface-light/70 mb-1 text-xs',
  inputWrapper: 'rounded-medium px-3 h-10 hover:bg-surface-deep',
  input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
} as const;

const selectClassNames = {
  label: 'text-surface-light mb-1',
  trigger:
    'rounded-large px-4 border border-surface-liner bg-transparent hover:bg-surface-deep data-[focus=true]:outline-none',
  value: 'text-surface-light',
  popover: 'bg-surface-deepest border border-surface-liner rounded-large',
  listbox: 'p-1 [&_[data-hover=true]]:bg-surface-deep',
} as const;

const CATEGORY_ORDER: DispatchTermCategory[] = [
  'entities',
  'callStatuses',
  'teamStatuses',
  'equipment',
  'clinicOutcomes',
  'actions',
];

export default function LanguageSection() {
  const {
    presetId,
    availablePresets,
    setActivePresetId,
    forkPreset,
    updatePreset,
    deletePreset,
    isOwnPreset,
    loading,
  } = useDispatchVocabulary();

  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [draftTerms, setDraftTerms] = useState<Record<string, string>>({});
  const [forkName, setForkName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [creatingNew, setCreatingNew] = useState(false);
  const [newPresetBaseId, setNewPresetBaseId] = useState(presetId);
  const [newPresetName, setNewPresetName] = useState('');
  const [creating, setCreating] = useState(false);

  const target = useMemo(
    () => availablePresets.find((p) => p.id === editingTargetId) ?? null,
    [availablePresets, editingTargetId],
  );

  // Load the editor's draft whenever the edit target changes.
  useEffect(() => {
    setDraftTerms(target?.terms ?? {});
    setForkName('');
  }, [target]);

  const canSaveInPlace = editingTargetId ? isOwnPreset(editingTargetId) : false;

  const dirty = useMemo(() => {
    if (!target) return false;
    return DISPATCH_TERMS.some((t) => (draftTerms[t.key] ?? '') !== (target.terms[t.key] ?? ''));
  }, [draftTerms, target]);

  const termsByCategory = useMemo(() => {
    const grouped = new Map<DispatchTermCategory, typeof DISPATCH_TERMS>();
    for (const term of DISPATCH_TERMS) {
      const list = grouped.get(term.category) ?? [];
      list.push(term);
      grouped.set(term.category, list);
    }
    return grouped;
  }, []);

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      if (canSaveInPlace) {
        await updatePreset(target.id, draftTerms);
      } else {
        const name = forkName.trim();
        if (!name) return;
        const newId = await forkPreset(name, draftTerms, target.id);
        setEditingTargetId(newId);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFromTemplate = async () => {
    const name = newPresetName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const terms =
        newPresetBaseId === BLANK_TEMPLATE_ID
          ? {}
          : availablePresets.find((p) => p.id === newPresetBaseId)?.terms ?? {};
      const basedOn = newPresetBaseId === BLANK_TEMPLATE_ID ? undefined : newPresetBaseId;
      const newId = await forkPreset(name, terms, basedOn);
      setCreatingNew(false);
      setNewPresetName('');
      setEditingTargetId(newId);
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePreset = async (id: string, name: string) => {
    if (!confirm(`Delete the preset "${name}"? This can't be undone.`)) return;
    setDeletingId(id);
    try {
      await deletePreset(id);
      if (editingTargetId === id) setEditingTargetId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
      <CardBody className="p-6 space-y-4">
        <div>
          <p className="font-medium">Dispatch language</p>
          <p className="text-sm text-surface-light/70">
            Choose the terminology used across the dispatch interface. Presets you create are
            shared with everyone in your org.
          </p>
          <p className="text-sm text-surface-light/50 mt-1">
            This only changes what you see in the dispatch view — other dispatchers pick their
            own preset independently. Activity logs are always recorded in English, regardless
            of preset.
          </p>
        </div>

        <div className="space-y-2">
          {availablePresets.map((preset) => {
            const isActive = preset.id === presetId;
            const own = isOwnPreset(preset.id);
            return (
              <div
                key={preset.id}
                className={`flex items-center gap-3 rounded-large border px-4 py-2.5 transition-colors ${
                  isActive
                    ? 'border-accent bg-accent/10'
                    : 'border-surface-liner bg-surface-deeper/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActivePresetId(preset.id)}
                  aria-label={isActive ? `${preset.name} (active)` : `Set ${preset.name} as active`}
                  aria-pressed={isActive}
                  className="shrink-0 text-surface-light/60 hover:text-accent"
                  disabled={loading}
                >
                  {isActive ? (
                    <Check className="h-5 w-5 text-accent" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <span className="text-sm text-surface-light truncate block">
                    {preset.name}
                    {preset.createdByName ? (
                      <span className="text-surface-light/50"> — by {preset.createdByName}</span>
                    ) : null}
                  </span>
                </div>

                <Button
                  isIconOnly
                  size="sm"
                  radius="full"
                  variant="light"
                  aria-label={`Edit ${preset.name}`}
                  onPress={() => setEditingTargetId(preset.id)}
                  className="text-surface-light/70 hover:bg-surface-deep"
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                {own && (
                  <Button
                    isIconOnly
                    size="sm"
                    radius="full"
                    variant="light"
                    aria-label={`Delete ${preset.name}`}
                    isDisabled={deletingId === preset.id}
                    onPress={() => handleDeletePreset(preset.id, preset.name)}
                    className="text-status-red hover:bg-status-red/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <Button
          onPress={() => {
            setNewPresetBaseId(presetId);
            setCreatingNew((v) => !v);
          }}
          variant="bordered"
          size="md"
          radius="lg"
          className={`${PROFILE_ACTION_BUTTON} border-surface-liner text-surface-light hover:bg-surface-deep self-start`}
        >
          New preset
        </Button>

        {creatingNew && (
          <div className="rounded-large border border-surface-liner bg-surface-deeper/60 p-4 space-y-3">
            <p className="text-sm text-surface-light/70">
              Start a new shared preset from an existing one, or from scratch, then customize its
              terms.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                label="Based on"
                labelPlacement="outside"
                variant="flat"
                color="default"
                size="sm"
                radius="lg"
                classNames={selectClassNames}
                className="flex-1"
                selectedKeys={new Set([newPresetBaseId])}
                onSelectionChange={(keys) => {
                  const id = Array.from(keys)[0] as string | undefined;
                  if (id) setNewPresetBaseId(id);
                }}
                aria-label="Template preset"
              >
                {[
                  ...availablePresets.map((preset) => (
                    <SelectItem key={preset.id} textValue={preset.name}>
                      {preset.name}
                    </SelectItem>
                  )),
                  <SelectItem key={BLANK_TEMPLATE_ID} textValue="Blank">
                    Blank (start from scratch)
                  </SelectItem>,
                ]}
              </Select>
              <Input
                placeholder="New preset name"
                variant="flat"
                color="default"
                size="sm"
                radius="lg"
                classNames={inputClassNames}
                value={newPresetName}
                onValueChange={setNewPresetName}
                aria-label="New preset name"
                className="flex-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onPress={handleCreateFromTemplate}
                isDisabled={creating || !newPresetName.trim()}
                radius="lg"
                className="px-4 bg-accent hover:bg-accent/90 text-surface-light"
              >
                Create preset
              </Button>
              <Button
                onPress={() => {
                  setCreatingNew(false);
                  setNewPresetName('');
                }}
                variant="bordered"
                radius="lg"
                className="border-surface-liner text-surface-light hover:bg-surface-deep"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {target && (
          <div className="rounded-large border border-surface-liner bg-surface-deeper/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm">Editing: {target.name}</p>
              <Button
                size="sm"
                radius="full"
                variant="light"
                onPress={() => setEditingTargetId(null)}
                className="text-surface-light/70 hover:bg-surface-deep"
              >
                Close
              </Button>
            </div>

            <div className="minimal-scrollbar space-y-6 max-h-[28rem] overflow-y-auto pr-2">
              {CATEGORY_ORDER.map((category) => {
                const categoryTerms = termsByCategory.get(category);
                if (!categoryTerms?.length) return null;
                return (
                  <div key={category} className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-surface-light/50">
                      {DISPATCH_TERM_CATEGORY_LABELS[category]}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {categoryTerms.map((term) => (
                        <Input
                          key={term.key}
                          label={term.key}
                          labelPlacement="inside"
                          variant="flat"
                          color="default"
                          size="sm"
                          radius="lg"
                          classNames={inputClassNames}
                          value={draftTerms[term.key] ?? term.defaultLabel}
                          onValueChange={(value) =>
                            setDraftTerms((prev) => ({ ...prev, [term.key]: value }))
                          }
                          aria-label={`Label for ${term.key}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {dirty && (
              <div className="border-t border-surface-liner pt-3 space-y-3">
                {canSaveInPlace ? (
                  <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                    <p className="text-sm text-surface-light/70">
                      Save changes to &quot;{target.name}&quot; for everyone using it.
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        onPress={handleSave}
                        isDisabled={saving}
                        radius="lg"
                        className="px-4 bg-accent hover:bg-accent/90 text-surface-light"
                      >
                        Save changes
                      </Button>
                      <Button
                        onPress={() => setDraftTerms(target.terms)}
                        variant="bordered"
                        radius="lg"
                        className="border-surface-liner text-surface-light hover:bg-surface-deep"
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-surface-light/70">
                      Editing terms creates a new preset — it won&apos;t change &quot;{target.name}
                      &quot; for anyone else.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder={`${target.name} (edited)`}
                        variant="flat"
                        color="default"
                        size="sm"
                        radius="lg"
                        classNames={inputClassNames}
                        value={forkName}
                        onValueChange={setForkName}
                        aria-label="New preset name"
                        className="flex-1"
                      />
                      <div className="flex gap-2">
                        <Button
                          onPress={handleSave}
                          isDisabled={saving || !forkName.trim()}
                          radius="lg"
                          className="px-4 bg-accent hover:bg-accent/90 text-surface-light"
                        >
                          Save as new preset
                        </Button>
                        <Button
                          onPress={() => setDraftTerms(target.terms)}
                          variant="bordered"
                          radius="lg"
                          className="border-surface-liner text-surface-light hover:bg-surface-deep"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
