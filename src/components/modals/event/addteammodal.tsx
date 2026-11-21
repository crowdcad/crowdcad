// components/modals/AddTeamModal.tsx
"use client";

import * as React from "react";
import { X, Plus, CircleHelp } from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Checkbox,
  Tooltip,
} from "@heroui/react";
import { Role } from "@/app/types";
import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";

export type TeamMemberDraft = { name: string; cert: string; lead: boolean };
export type TeamDraft = { name: string; members: TeamMemberDraft[] };

type Row = TeamMemberDraft & { id: number };

type Props = {
  isOpen: boolean;
  onClose: () => void;

  mode?: "create" | "edit";
  titleOverride?: string;
  submitLabelOverride?: string;

  roles: Role[]; // e.g., [{ name: "EMT", fullName: "Emergency Medical Technician" }, ...]

  // Names already in use this session. In edit mode the caller should exclude
  // the team currently being edited so renaming back to its own name is allowed.
  existingTeamNames: string[];

  // Edit mode only: the team being edited.
  initialTeam?: TeamDraft;

  // Called on every save (both "Save & add another" and "Save & close"/edit save).
  onSave: (team: TeamDraft, opts: { addAnother: boolean }) => void | Promise<void>;
};

let rowIdCounter = 0;
const nextRowId = () => ++rowIdCounter;

const emptyRow = (cert: string): Row => ({ id: nextRowId(), name: "", cert, lead: false });

const rowsFromMembers = (members: TeamMemberDraft[], trailingCert: string): Row[] => [
  ...members.map((m) => ({ ...m, id: nextRowId() })),
  emptyRow(trailingCert),
];

/**
 * "Medic 4" -> "Medic 5"; a name with no trailing integer gets " 1" appended;
 * no prior name in the session defaults to `first` ("Team 1"; supervisors use "S1").
 */
export function getNextTeamName(existingNames: string[], first = "Team 1"): string {
  if (existingNames.length === 0) return first;
  const last = existingNames[existingNames.length - 1].trim();
  const match = last.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    return `${prefix}${parseInt(digits, 10) + 1}`;
  }
  return `${last} 1`;
}

export default function AddTeamModal({
  isOpen,
  onClose,
  mode = "create",
  titleOverride,
  submitLabelOverride,
  roles,
  existingTeamNames,
  initialTeam,
  onSave,
}: Props) {
  const { t } = useDispatchTerms();
  const isEdit = mode === "edit";

  const [teamName, setTeamName] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [nameError, setNameError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const stickyCertRef = React.useRef("");
  const nameInputRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const focusMemberIdRef = React.useRef<number | null>(null);
  const wasOpenRef = React.useRef(false);

  const defaultCert = () => stickyCertRef.current || roles[0]?.name || "";

  const resetForNewTeam = (nextName: string, opts: { focusMember: boolean }) => {
    const row = emptyRow(defaultCert());
    setRows([row]);
    setTeamName(nextName);
    setNameError("");
    if (opts.focusMember) focusMemberIdRef.current = row.id;
  };

  // (Re-)initialize whenever the modal transitions closed -> open.
  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      if (isEdit && initialTeam) {
        const cert = initialTeam.members[initialTeam.members.length - 1]?.cert || defaultCert();
        setTeamName(initialTeam.name);
        setRows(rowsFromMembers(initialTeam.members, cert));
        setNameError("");
      } else {
        resetForNewTeam(getNextTeamName(existingTeamNames), { focusMember: false });
      }
    }
    wasOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Focus a queued member row once it exists in the DOM (e.g. a newly appended row).
  React.useEffect(() => {
    if (focusMemberIdRef.current == null) return;
    const id = focusMemberIdRef.current;
    focusMemberIdRef.current = null;
    requestAnimationFrame(() => nameInputRefs.current[id]?.focus());
  }, [rows]);

  const updateRow = (id: number, patch: Partial<TeamMemberDraft>) => {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: number) => {
    setRows((current) => {
      const next = current.filter((r) => r.id !== id);
      return next.length > 0 ? next : [emptyRow(defaultCert())];
    });
  };

  const handleNameKeyDown = (row: Row, idx: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const isLast = idx === rows.length - 1;
    if (isLast) {
      if (!row.name.trim()) return;
      const newRow = emptyRow(defaultCert());
      focusMemberIdRef.current = newRow.id;
      setRows((current) => [...current, newRow]);
    } else {
      const nextRow = rows[idx + 1];
      nameInputRefs.current[nextRow.id]?.focus();
    }
  };

  const commitSave = async (addAnother: boolean) => {
    if (submitting) return;
    const trimmedName = teamName.trim();
    if (!trimmedName) {
      setNameError(t("Please enter a team name."));
      return;
    }
    const isDuplicate = existingTeamNames.some(
      (n) => n.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      setNameError(t("Team name already used."));
      return;
    }

    const members: TeamMemberDraft[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), cert: r.cert || defaultCert(), lead: r.lead }));

    try {
      setSubmitting(true);
      await Promise.resolve(onSave({ name: trimmedName, members }, { addAnother }));
    } finally {
      setSubmitting(false);
    }

    if (addAnother) {
      resetForNewTeam(getNextTeamName([...existingTeamNames, trimmedName]), { focusMember: true });
    } else {
      onClose();
    }
  };

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: "rounded-large px-4 hover:bg-surface-deep",
    input:
      "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  const selectClassNames = {
    trigger:
      "rounded-large px-3 hover:bg-surface-deep data-[focus=true]:outline-none",
    value: "text-surface-light",
    popover: "bg-surface-deepest border border-surface-liner rounded-large",
    listbox:
      "p-1 [&_[data-hover=true]]:bg-surface-deep [&_[data-selected=true]]:bg-surface-deep",
  } as const;

  const title = titleOverride ?? (isEdit ? t("Edit Team") : t("Add New Team"));

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: "rounded-lg bg-surface-deepest text-surface-light mt-20",
        header: "pb-0",
        body: "py-4",
        footer: "pt-0",
      }}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="text-2xl font-bold text-surface">
              {title}
            </ModalHeader>

            <ModalBody>
              <Input
                label={t("Team Name")}
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={teamName}
                onValueChange={(v) => {
                  setTeamName(v);
                  if (nameError) setNameError("");
                }}
                isInvalid={!!nameError}
                errorMessage={nameError}
              />

              <div className="flex flex-col gap-2 mt-3">
                <div className="grid grid-cols-[1fr_10rem_3.5rem_2rem] gap-2 px-1 text-xs text-surface-faint">
                  <span>{t("Member name")}</span>
                  <span>{t("Certification")}</span>
                  <span className="inline-flex items-center gap-1">
                    {t("Lead")}
                    <Tooltip content="Marks this member as the team's point of contact for radio/dispatch communication." placement="top">
                      <CircleHelp className="w-3 h-3 text-surface-faint" />
                    </Tooltip>
                  </span>
                  <span />
                </div>

                {rows.map((row, idx) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_10rem_3.5rem_2rem] gap-2 items-center"
                  >
                    <Input
                      ref={(el) => {
                        nameInputRefs.current[row.id] = el;
                      }}
                      aria-label={t("Member name")}
                      variant="flat"
                      size="md"
                      radius="lg"
                      classNames={inputClassNames}
                      value={row.name}
                      onValueChange={(v) => updateRow(row.id, { name: v })}
                      onKeyDown={handleNameKeyDown(row, idx)}
                    />

                    <Select
                      aria-label={t("Certification")}
                      variant="flat"
                      size="md"
                      radius="lg"
                      classNames={selectClassNames}
                      selectedKeys={row.cert ? new Set([row.cert]) : new Set()}
                      onSelectionChange={(keys) => {
                        const val = Array.from(keys)[0] as string | undefined;
                        updateRow(row.id, { cert: val ?? "" });
                        if (val) stickyCertRef.current = val;
                      }}
                    >
                      {roles.map((role) => (
                        <SelectItem
                          key={role.name}
                          aria-label={role.fullName}
                          textValue={role.fullName}
                        >
                          {role.name}
                        </SelectItem>
                      ))}
                    </Select>

                    <Checkbox
                      isSelected={row.lead}
                      onValueChange={(v) => updateRow(row.id, { lead: v })}
                      aria-label={t("Lead")}
                      classNames={{ wrapper: "after:bg-accent" }}
                    />

                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      radius="full"
                      aria-label={t("Remove member")}
                      className="text-surface-faint hover:text-status-red"
                      onPress={() => removeRow(row.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-3 pt-1">
                  <div className="flex-1 h-px bg-surface-liner" />
                  <Button
                    isIconOnly
                    size="sm"
                    radius="full"
                    variant="flat"
                    aria-label={t("Add member")}
                    className="shrink-0 text-surface-light bg-default/40 hover:bg-default/60"
                    onPress={() => {
                      const newRow = emptyRow(defaultCert());
                      focusMemberIdRef.current = newRow.id;
                      setRows((current) => [...current, newRow]);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 h-px bg-surface-liner" />
                </div>
              </div>
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button
                onPress={() => {
                  close();
                  onClose();
                }}
                className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
                variant="bordered"
                radius="lg"
              >
                {t("Cancel")}
              </Button>

              {isEdit ? (
                <Button
                  onPress={() => commitSave(false)}
                  isDisabled={submitting}
                  radius="lg"
                  className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                >
                  {submitLabelOverride ?? t("Save Changes")}
                </Button>
              ) : (
                <>
                  <Button
                    onPress={() => commitSave(true)}
                    isDisabled={submitting}
                    variant="flat"
                    radius="lg"
                    className="px-4 py-2 text-surface-light bg-default/40 hover:bg-default/60"
                  >
                    {t("Save & add another")}
                  </Button>
                  <Button
                    onPress={() => commitSave(false)}
                    isDisabled={submitting}
                    radius="lg"
                    className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                  >
                    {submitLabelOverride ?? t("Save & close")}
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
