// components/modals/QuickCallModal.tsx
"use client";

import * as React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Autocomplete,
  AutocompleteItem,
  Select,
  SelectItem,
} from "@heroui/react";
import type { Event, Staff, Supervisor, Call, TeamLogEntry } from "@/app/types";
import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";
import { getVenueLocationOptions } from "@/lib/clinics";
import { STATIC_SELECTOR_BUTTON_CLASS, staticSelectorButtonProps } from "@/lib/autocompleteSelector";

type QuickCallState = {
  location: string;
  source: string;
  age: string;
  gender: string;
  chiefComplaint: string;
  assignedTeam: string; // single select
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  event?: Event | null;
  updateEvent: (data: Partial<Event>) => Promise<void>;

  quickCall: QuickCallState;
  setQuickCall: React.Dispatch<React.SetStateAction<QuickCallState>>;

  formatAgeSex: (age?: string, gender?: string) => string;
  parseAgeSex: (raw: string) => { age: string; gender: string };

  quickCallRef?: React.RefObject<HTMLFormElement | null>;
};

export default function QuickCallModal({
  isOpen,
  onClose,
  event,
  updateEvent,
  quickCall,
  setQuickCall,
  formatAgeSex,
  parseAgeSex,
  quickCallRef,
}: Props) {
  const { t } = useDispatchTerms();
  const [submitting, setSubmitting] = React.useState(false);

  const locationOptions = React.useMemo(() => getVenueLocationOptions(event?.venue), [event?.venue]);

  // Replace the postedTeams useMemo
  const { availableTeams, inactiveTeams } = React.useMemo(() => {
    const allTeams = event?.staff ?? [];
    
    const available = allTeams.filter((staff: Staff) => {
      const isAssignedToActiveCall = event?.calls?.some((c: Call) => 
        c.assignedTeam?.includes(staff.team) && 
        !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled'].includes(c.status)
      );
      return !isAssignedToActiveCall && staff.status === 'Available';
    }).sort((a: Staff, b: Staff) =>
      a.team.localeCompare(b.team, undefined, { numeric: true })
    );
    
    const inactive = allTeams.filter((staff: Staff) => {
      const isAssignedToActiveCall = event?.calls?.some((c: Call) => 
        c.assignedTeam?.includes(staff.team) && 
        !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled'].includes(c.status)
      );
      return !isAssignedToActiveCall && ['In Clinic', 'On Break'].includes(staff.status || '');
    }).sort((a: Staff, b: Staff) =>
      a.team.localeCompare(b.team, undefined, { numeric: true })
    );
    
    return { availableTeams: available, inactiveTeams: inactive };
  }, [event?.staff, event?.calls]);

  // Supervisors can also be dispatched to initiate a call — same
  // available/inactive split as teams, offered alongside them in the same
  // Assign Team list.
  const { availableSupervisors, inactiveSupervisors } = React.useMemo(() => {
    const allSupervisors = event?.supervisor ?? [];

    const isAssignedToActiveCall = (supervisor: Supervisor) =>
      event?.calls?.some((c: Call) =>
        c.assignedTeam?.includes(supervisor.team) &&
        !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled'].includes(c.status)
      );

    const available = allSupervisors
      .filter((s) => !isAssignedToActiveCall(s) && s.status === 'Available')
      .sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }));

    const inactive = allSupervisors
      .filter((s) => !isAssignedToActiveCall(s) && ['In Clinic', 'On Break'].includes(s.status || ''))
      .sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }));

    return { availableSupervisors: available, inactiveSupervisors: inactive };
  }, [event?.supervisor, event?.calls]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const now = new Date();
      const hhmm =
        now.getHours().toString().padStart(2, "0") +
        now.getMinutes().toString().padStart(2, "0");

      const nextOrder =
        event?.calls?.length
          ? Math.max(
              ...event.calls.map((c) => (typeof c.order === "number" ? c.order : 0))
            ) + 1
          : 1;

      const cleanCall: Call = {
        id: Date.now().toString(),
        order: nextOrder,
        status: quickCall.assignedTeam ? "Assigned" : "Pending",
        location: quickCall.location.trim() || "Unknown",
        assignedTeam: quickCall.assignedTeam ? [quickCall.assignedTeam] : [],
        chiefComplaint: quickCall.chiefComplaint?.trim() || "",
        ...(quickCall.source?.trim() && { source: quickCall.source.trim() }),
        ...(quickCall.age?.trim() && { age: quickCall.age.trim() }),
        ...(quickCall.gender?.trim() && { gender: quickCall.gender.trim() }),
        priority: false,
        log: [
          {
            timestamp: now.getTime(),
            message: `${hhmm} - Call created${
              quickCall.source ? ` from ${quickCall.source}` : ""
            }${quickCall.chiefComplaint ? `, complaint: ${quickCall.chiefComplaint}` : ""}, location: ${
              quickCall.location.trim() || "Unknown"
            }${
              quickCall.assignedTeam ? `, assigned to ${quickCall.assignedTeam}` : ""
            }`,
          },
        ],
      };

      // Update staff or supervisor if one was assigned — the assignee is
      // either a staff team or a supervisor callsign (never both), so only
      // one of these actually changes anything.
      let updatedStaff: Staff[] | undefined = event?.staff;
      let updatedSupervisor: Supervisor[] | undefined = event?.supervisor;

      if (quickCall.assignedTeam) {
        const teamLogEntry: TeamLogEntry = {
          timestamp: now.getTime(),
          message: `${hhmm} - responding to call #${nextOrder}`,
        };

        const assignedIsSupervisor = event?.supervisor?.some((s) => s.team === quickCall.assignedTeam);

        if (assignedIsSupervisor && event?.supervisor) {
          updatedSupervisor = event.supervisor.map((supervisor: Supervisor) =>
            supervisor.team === quickCall.assignedTeam
              ? {
                  ...supervisor,
                  status: "En Route",
                  location: quickCall.location,
                  originalPost: supervisor.location || "Unknown",
                  log: [...(supervisor.log || []), teamLogEntry],
                }
              : supervisor
          );
        } else if (event?.staff) {
          updatedStaff = event.staff.map((staff: Staff) =>
            staff.team === quickCall.assignedTeam
              ? {
                  ...staff,
                  status: "En Route",
                  location: quickCall.location,
                  originalPost: staff.location || "Unknown",
                  // Now teamLogEntry matches the type expected inside the log array
                  log: [...(staff.log || []), teamLogEntry],
                }
              : staff
          );
        }
      }

      await updateEvent({
        calls: [...(event?.calls || []), cleanCall],
        ...(updatedStaff && { staff: updatedStaff }),
        ...(updatedSupervisor && { supervisor: updatedSupervisor }),
      });

      // Reset & close
      setQuickCall({
        location: "",
        source: "",
        age: "",
        gender: "",
        chiefComplaint: "",
        assignedTeam: "",
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  // Inputs
  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: [
      "rounded-2xl px-4",
      "hover:bg-surface-deep",
    ].join(" "),
    input:
      "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  // Select — matches inputClassNames' trigger/label treatment so "Assign
  // Team" reads consistently with the Input/Autocomplete fields above it.
  const selectClassNames = {
    label: "text-surface-light mb-1",
    trigger: [
      "rounded-2xl px-4",
      "hover:bg-surface-deep",
      "text-surface-light",
    ].join(" "),
    value: "text-surface-light",
  } as const;

  // Focus should land on whichever field is first (in on-screen order)
  // still empty, not always Location — a map-click prefill (location or
  // assigned team) shouldn't leave the cursor sitting in an already-filled
  // field. React's autoFocus only fires once per mount, and this modal's
  // content remounts each time it opens, so recomputing it per-render is
  // safe: it only actually takes effect at that fresh mount.
  const firstEmptyField = !quickCall.location.trim()
    ? "location"
    : !quickCall.source.trim()
    ? "source"
    : !quickCall.age.trim() && !quickCall.gender.trim()
    ? "ageSex"
    : !quickCall.chiefComplaint.trim()
    ? "chiefComplaint"
    : !quickCall.assignedTeam
    ? "assignedTeam"
    : null;


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
          <form ref={quickCallRef} onSubmit={handleSubmit}>
            <ModalHeader className="text-2xl font-bold text-surface">
              {t("Add Call")}
            </ModalHeader>

            <ModalBody className="">
              <Autocomplete
                autoFocus={firstEmptyField === "location"}
                label={t("Location")}
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                inputProps={{ classNames: inputClassNames }}
                classNames={{ selectorButton: STATIC_SELECTOR_BUTTON_CLASS }}
                selectorButtonProps={staticSelectorButtonProps}
                inputValue={quickCall.location}
                onInputChange={(v) => setQuickCall((p) => ({ ...p, location: v }))}
                onSelectionChange={(key) => {
                  if (key) setQuickCall((p) => ({ ...p, location: key as string }));
                }}
                allowsCustomValue
              >
                {/* 'Unknown' listed first — an unfamiliar location shouldn't
                    force typing; tabbing past a pile of venue-post suggestions
                    can land here instead. */}
                {Array.from(new Set(['Unknown', ...locationOptions])).map((loc) => (
                  <AutocompleteItem key={loc}>{loc}</AutocompleteItem>
                ))}
              </Autocomplete>
              <div className="flex gap-2">
                <Input
                  autoFocus={firstEmptyField === "source"}
                  label={t("Source")}
                  labelPlacement="inside"
                  variant="flat"
                  size="lg"
                  radius="lg"
                  classNames={inputClassNames}
                  value={quickCall.source}
                  onValueChange={(v) => setQuickCall((p) => ({ ...p, source: v }))}
                  aria-label="Source"
                  className="flex-1"
                />
                <Input
                  autoFocus={firstEmptyField === "ageSex"}
                  label={t("Age/Sex")}
                  labelPlacement="inside"
                  variant="flat"
                  size="lg"
                  radius="lg"
                  classNames={inputClassNames}
                  value={formatAgeSex(quickCall.age, quickCall.gender)}
                  onValueChange={(v) => {
                    const { age, gender } = parseAgeSex(v);
                    setQuickCall((prev) => ({ ...prev, age, gender }));
                  }}
                  aria-label="Age/Sex"
                  className="w-1/3"
                />
              </div>

              <Input
                autoFocus={firstEmptyField === "chiefComplaint"}
                label={t("Chief Complaint")}
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={quickCall.chiefComplaint}
                onValueChange={(v) => setQuickCall((p) => ({ ...p, chiefComplaint: v }))}
                aria-label="Chief Complaint"
              />
              <Select
              autoFocus={firstEmptyField === "assignedTeam"}
              label={t("Assign Team")}
              placeholder={t("Select a team")}
              size="lg"
              radius="lg"
              selectedKeys={quickCall.assignedTeam ? new Set([quickCall.assignedTeam]) : new Set()}
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const key = Array.from(keys as Set<string>)[0] ?? "";
                setQuickCall((p) => ({ ...p, assignedTeam: key }));
              }}
              aria-label="Assign Team"
              disallowEmptySelection={false}
              classNames={selectClassNames}
            >
              {[
                ...availableTeams.map((team) => (
                  <SelectItem
                    key={team.team}
                    textValue={`${team.team} - ${t(team.location || 'Unknown')}`}
                  >
                    {team.team} - {t(team.location || 'Unknown')}
                  </SelectItem>
                )),
                ...availableSupervisors.map((supervisor) => (
                  <SelectItem
                    key={supervisor.team}
                    textValue={`${supervisor.team} - ${t(supervisor.location || 'Unknown')}`}
                  >
                    {supervisor.team} - {t(supervisor.location || 'Unknown')}
                  </SelectItem>
                )),
                ...inactiveTeams.map((team) => (
                  <SelectItem
                    key={team.team}
                    textValue={`${team.team} - ${t(team.location || 'Unknown')}`}
                    classNames={{
                      base: "bg-status-blue/20"
                    }}
                  >
                    {team.team} - {t(team.location || 'Unknown')}
                  </SelectItem>
                )),
                ...inactiveSupervisors.map((supervisor) => (
                  <SelectItem
                    key={supervisor.team}
                    textValue={`${supervisor.team} - ${t(supervisor.location || 'Unknown')}`}
                    classNames={{
                      base: "bg-status-blue/20"
                    }}
                  >
                    {supervisor.team} - {t(supervisor.location || 'Unknown')}
                  </SelectItem>
                ))
              ]}
            </Select>
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button
                onPress={() => {
                  // Only reset fields when Cancel is clicked (not when clicking off)
                  setQuickCall({
                    location: "",
                    source: "",
                    age: "",
                    gender: "",
                    chiefComplaint: "",
                    assignedTeam: "",
                  });
                  close();
                  onClose();
                }}
                className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
                variant="bordered"
                radius="lg"
              >
                {t("Cancel")}
              </Button>

              <Button
                type="submit"
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={submitting}
              >
                {t("Submit")}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
