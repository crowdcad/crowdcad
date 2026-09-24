'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, ScrollShadow, Tooltip } from '@heroui/react';
import { parseDate, getLocalTimeZone, today, Time } from '@internationalized/date';
import { CircleHelp, Pencil, Trash2 } from 'lucide-react';
import type { Event, EventEquipment, Post, Staff, Supervisor, Venue } from '@/app/types';
import LoadingScreen from '@/components/ui/loading-screen';
import { useScheduleGeneration } from '@/hooks/useScheduleGeneration';
import { scheduleTimesToWindow, formatTimeValue, parseTimeValue } from '@/lib/scheduleUtils';
import { syncClinicsFromVenue } from '@/lib/clinics';
import { syncDispatchZonesFromVenue } from '@/lib/zones';
import { stripUndefined } from '@/lib/utils';
import MetadataSection from '@/components/event-create/MetadataSection';
import TeamStaffingSection from '@/components/event-create/TeamStaffingSection';
import SupervisorStaffingSection from '@/components/event-create/SupervisorStaffingSection';
import PostingScheduleSection from '@/components/event-create/PostingScheduleSection';
import { EquipmentSelectionSection, PostsSelectionSection } from '@/components/event-create/PostsEquipmentSection';
import { WizardShell, StepProgress, ReviewColumns, type WizardStep, type ReviewColumn } from '@/components/wizard';
import AddTeamModal, { TeamDraft, TeamMemberDraft } from '@/components/modals/event/addteammodal';
import AddSupervisorModal from '@/components/modals/event/addsupervisormodal';
import BulkImportModal from '@/components/modals/event/bulkimportmodal';
import {
  createDefaultLiteEventDraft,
  generateLiteEventId,
  getLiteEvent,
  type LiteEventDraft,
  saveLiteEvent,
} from '@/lib/liteEventStore';

const LICENSES = ['CPR', 'EMT-B', 'EMT-A', 'EMT-P', 'RN', 'MD/DO'];

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getPostName = (post: Post): string => (typeof post === 'string' ? post : post.name);

const setPostName = (post: Post, name: string): Post =>
  typeof post === 'string' ? { name, x: null, y: null } : { ...post, name };

const parseMemberStrings = (members: string[]): TeamMemberDraft[] =>
  members.map((member) => {
    const match = member.match(/^(.+?)\s*\[([^\]]+)\]\s*(\(Lead\))?$/);
    if (match) {
      return { name: match[1], cert: match[2], lead: Boolean(match[3]) };
    }
    return { name: member, cert: '', lead: false };
  });

// The shape the shared event-create step components (also used by cloud
// event creation) expect. Lite events don't have a pre-existing Venue
// (no id/userId, no map, no layers) — this adapter fabricates the minimal
// Venue wrapper those components need around the same posts/equipment
// arrays a LiteEventDraft already carries, so they can be reused unmodified.
type SectionEventData = Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] };

const toSectionData = (draft: LiteEventDraft): SectionEventData => ({
  ...draft,
  venue: {
    id: draft.id,
    userId: '',
    name: draft.venue.name,
    posts: draft.venue.posts,
    equipment: draft.venue.equipment,
  },
});

const fromSectionData = (current: LiteEventDraft, next: SectionEventData): LiteEventDraft => ({
  ...current,
  name: next.name ?? current.name,
  date: next.date ?? current.date,
  surgeLimitPercent: next.surgeLimitPercent,
  pendingTransportSurgeThreshold: next.pendingTransportSurgeThreshold,
  unassignedCallSurgeSeconds: next.unassignedCallSurgeSeconds,
  eventEquipment: next.eventEquipment,
  eventPosts: next.eventPosts ?? current.eventPosts,
  venue: {
    name: next.venue.name,
    posts: next.venue.posts ?? [],
    equipment: next.venue.equipment,
  },
});

function LiteCreateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedEventId = searchParams.get('eventId');

  const [loading, setLoading] = useState(true);
  const [eventDraft, setEventDraft] = useState<LiteEventDraft | null>(null);

  const [currentStepId, setCurrentStepId] = useState<string>('basics');

  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [bulkImportMode, setBulkImportMode] = useState<'team' | 'supervisor' | null>(null);
  const [openTeams, setOpenTeams] = useState<Record<number, boolean>>({});
  const [openSupervisors, setOpenSupervisors] = useState<Record<number, boolean>>({});
  const [postsEnabled, setPostsEnabled] = useState(true);
  const [lastSelectedPostIndex, setLastSelectedPostIndex] = useState<number | null>(null);

  const [locationInput, setLocationInput] = useState('');
  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);
  const [locationEditInput, setLocationEditInput] = useState('');
  const [equipmentInput, setEquipmentInput] = useState('');
  const [editingEquipmentIndex, setEditingEquipmentIndex] = useState<number | null>(null);
  const [equipmentEditInput, setEquipmentEditInput] = useState('');

  const {
    scheduleFrom,
    setScheduleFrom,
    scheduleTo,
    setScheduleTo,
    scheduleBy,
    setScheduleBy,
    postingTimes,
  } = useScheduleGeneration({ enabled: postsEnabled });
  const [scheduleChips, setScheduleChips] = useState<{ id: string; time: string; editable: boolean }[]>([]);
  const [editingChipId, setEditingChipId] = useState<string | null>(null);
  const [editingChipValue, setEditingChipValue] = useState('');

  const initializedScheduleRef = useRef<string | null>(null);

  const inputClassNames = {
    label: 'text-surface-light font-medium',
    inputWrapper: 'rounded-large px-4',
    input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
  };

  const selectClassNames = {
    label: 'text-surface-light font-medium',
    input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
    inputWrapper: 'rounded-large px-4 pr-6 shadow-none group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const resolvedEventId = requestedEventId?.trim() || generateLiteEventId();

      if (!requestedEventId) {
        router.replace(`/lite/create?eventId=${resolvedEventId}`);
      }

      let existing = await getLiteEvent(resolvedEventId);

      if (!existing) {
        let seededName = '';
        if (typeof window !== 'undefined') {
          const seedRaw = sessionStorage.getItem(`lite_event_${resolvedEventId}`);
          if (seedRaw) {
            try {
              const parsed = JSON.parse(seedRaw) as { name?: string };
              seededName = parsed?.name?.trim() ?? '';
            } catch {
              seededName = '';
            }
          }
        }

        existing = createDefaultLiteEventDraft(resolvedEventId, seededName);
        await saveLiteEvent(existing);
      }

      if (cancelled) return;
      setEventDraft(existing);
      setLoading(false);
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [requestedEventId, router]);

  useEffect(() => {
    if (!eventDraft) return;
    if (initializedScheduleRef.current === eventDraft.id) return;

    const from = parseTimeValue(eventDraft.scheduleConfig.from, new Time(16, 0));
    const to = parseTimeValue(eventDraft.scheduleConfig.to, new Time(23, 59));

    setPostsEnabled(eventDraft.postingScheduleEnabled ?? eventDraft.postingTimes.length > 0);
    setScheduleFrom(from);
    setScheduleTo(to);
    setScheduleBy(eventDraft.scheduleConfig.by || '75');

    if (eventDraft.postingTimes.length > 0) {
      setScheduleChips(eventDraft.postingTimes.map((time) => ({ id: makeId(), time, editable: false })));
    } else {
      setScheduleChips([]);
    }

    initializedScheduleRef.current = eventDraft.id;
  }, [eventDraft, setScheduleBy, setScheduleFrom, setScheduleTo]);

  useEffect(() => {
    if (!eventDraft) return;
    const timeout = window.setTimeout(() => {
      void saveLiteEvent(eventDraft);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [eventDraft]);

  const updateDraft = (updater: (current: LiteEventDraft) => LiteEventDraft) => {
    setEventDraft((current) => (current ? updater(current) : current));
  };

  // Keep the event's own start/end — used for reporting (the summary page's
  // analytics window) independent of whether auto-posting is enabled — in
  // sync with the Schedule section's From/To fields, mirroring cloud event
  // creation.
  useEffect(() => {
    if (!eventDraft) return;
    const { start, end } = scheduleTimesToWindow(eventDraft.date || new Date().toISOString(), scheduleFrom, scheduleTo);
    updateDraft((current) => ({ ...current, scheduleStart: start, scheduleEnd: end }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleFrom, scheduleTo, eventDraft?.date]);

  const eventDraftId = eventDraft?.id;
  useEffect(() => {
    if (!eventDraftId) return;

    setScheduleChips(postingTimes.map((time) => ({ id: makeId(), time, editable: false })));

    updateDraft((current) => ({
      ...current,
      postingScheduleEnabled: postsEnabled,
      postingTimes,
      scheduleConfig: {
        from: formatTimeValue(scheduleFrom),
        to: formatTimeValue(scheduleTo),
        by: scheduleBy,
      },
    }));
  }, [eventDraftId, postingTimes, postsEnabled, scheduleFrom, scheduleTo, scheduleBy]);

  const updateSectionData = (updater: React.SetStateAction<SectionEventData>) => {
    updateDraft((current) => {
      const currentSection = toSectionData(current);
      const nextSection =
        typeof updater === 'function'
          ? (updater as (prev: SectionEventData) => SectionEventData)(currentSection)
          : updater;
      return fromSectionData(current, nextSection);
    });
  };

  const addLocation = () => {
    const name = locationInput.trim();
    if (!name) return;

    updateDraft((current) => {
      const duplicate = current.venue.posts.some((post) => getPostName(post).toLowerCase() === name.toLowerCase());
      if (duplicate) return current;

      const nextPost: Post = { name, x: null, y: null };
      return { ...current, venue: { ...current.venue, posts: [...current.venue.posts, nextPost] } };
    });

    setLocationInput('');
  };

  const removeLocation = (index: number) => {
    updateDraft((current) => {
      const target = current.venue.posts[index];
      if (!target) return current;

      const removedName = getPostName(target);
      return {
        ...current,
        venue: { ...current.venue, posts: current.venue.posts.filter((_, idx) => idx !== index) },
        eventPosts: current.eventPosts.filter((post) => getPostName(post) !== removedName),
        eventEquipment: current.eventEquipment.map((item) =>
          item.defaultLocation === removedName ? { ...item, defaultLocation: undefined } : item
        ),
      };
    });

    if (editingLocationIndex === index) {
      setEditingLocationIndex(null);
      setLocationEditInput('');
    }
  };

  const startLocationEdit = (index: number) => {
    const post = eventDraft?.venue.posts[index];
    if (!post) return;
    setEditingLocationIndex(index);
    setLocationEditInput(getPostName(post));
  };

  const saveLocationEdit = () => {
    if (editingLocationIndex === null) return;
    const nextName = locationEditInput.trim();
    if (!nextName) return;

    updateDraft((current) => {
      const existingPost = current.venue.posts[editingLocationIndex];
      if (!existingPost) return current;

      const oldName = getPostName(existingPost);
      const duplicate = current.venue.posts.some(
        (post, idx) => idx !== editingLocationIndex && getPostName(post).toLowerCase() === nextName.toLowerCase()
      );
      if (duplicate) return current;

      const nextPosts = [...current.venue.posts];
      nextPosts[editingLocationIndex] = setPostName(existingPost, nextName);

      return {
        ...current,
        venue: { ...current.venue, posts: nextPosts },
        eventPosts: current.eventPosts.map((post) => (getPostName(post) === oldName ? setPostName(post, nextName) : post)),
        eventEquipment: current.eventEquipment.map((item) =>
          item.defaultLocation === oldName ? { ...item, defaultLocation: nextName } : item
        ),
      };
    });

    setEditingLocationIndex(null);
    setLocationEditInput('');
  };

  const cancelLocationEdit = () => {
    setEditingLocationIndex(null);
    setLocationEditInput('');
  };

  const addEquipment = () => {
    const name = equipmentInput.trim();
    if (!name) return;

    updateDraft((current) => {
      const duplicate = current.venue.equipment.some((equipment) => equipment.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return current;

      return {
        ...current,
        venue: {
          ...current.venue,
          equipment: [...current.venue.equipment, { id: makeId(), name, status: 'Available' }],
        },
      };
    });

    setEquipmentInput('');
  };

  const removeEquipment = (index: number) => {
    updateDraft((current) => {
      const item = current.venue.equipment[index];
      if (!item) return current;

      return {
        ...current,
        venue: { ...current.venue, equipment: current.venue.equipment.filter((_, idx) => idx !== index) },
        eventEquipment: current.eventEquipment.filter((eq) => eq.id !== item.id),
      };
    });

    if (editingEquipmentIndex === index) {
      setEditingEquipmentIndex(null);
      setEquipmentEditInput('');
    }
  };

  const startEquipmentEdit = (index: number) => {
    const item = eventDraft?.venue.equipment[index];
    if (!item) return;
    setEditingEquipmentIndex(index);
    setEquipmentEditInput(item.name);
  };

  const saveEquipmentEdit = () => {
    if (editingEquipmentIndex === null) return;
    const nextName = equipmentEditInput.trim();
    if (!nextName) return;

    updateDraft((current) => {
      const existing = current.venue.equipment[editingEquipmentIndex];
      if (!existing) return current;

      const duplicate = current.venue.equipment.some(
        (equipment, idx) => idx !== editingEquipmentIndex && equipment.name.toLowerCase() === nextName.toLowerCase()
      );
      if (duplicate) return current;

      const nextEquipment = [...current.venue.equipment];
      nextEquipment[editingEquipmentIndex] = { ...existing, name: nextName };

      return {
        ...current,
        venue: { ...current.venue, equipment: nextEquipment },
        eventEquipment: current.eventEquipment.map((equipment) =>
          equipment.id === existing.id ? { ...equipment, name: nextName } : equipment
        ),
      };
    });

    setEditingEquipmentIndex(null);
    setEquipmentEditInput('');
  };

  const cancelEquipmentEdit = () => {
    setEditingEquipmentIndex(null);
    setEquipmentEditInput('');
  };

  const handleSaveTeam = (team: TeamDraft) => {
    updateDraft((current) => {
      if (editingTeamIndex !== null) {
        const existing = current.staff[editingTeamIndex];
        if (!existing) return current;

        const nextStaff: Staff = {
          ...existing,
          team: team.name,
          members: team.members.map((m) => `${m.name} [${m.cert}]${m.lead ? ' (Lead)' : ''}`),
        };

        const nextStaffArray = [...current.staff];
        nextStaffArray[editingTeamIndex] = nextStaff;
        return { ...current, staff: nextStaffArray };
      }

      const members = team.members.map((m) => `${m.name} [${m.cert}]${m.lead ? ' (Lead)' : ''}`);
      const nextStaff: Staff = { team: team.name, location: 'No Post', status: 'On Break', members };
      return { ...current, staff: [...current.staff, nextStaff] };
    });
  };

  const parseTeamForEdit = (team: Staff): TeamDraft => ({
    name: team.team,
    members: parseMemberStrings(team.members),
  });

  const handleDeleteTeam = (idx: number) => {
    updateDraft((current) => ({ ...current, staff: current.staff.filter((_, i) => i !== idx) }));
  };

  const [samName, setSamName] = useState('');
  const [samMemberName, setSamMemberName] = useState('');
  const [samCert, setSamCert] = useState('');

  const handleAddSamUnit = () => {
    if (!samName.trim() || !samCert) return;
    updateDraft((current) => ({
      ...current,
      supervisor: [
        ...current.supervisor,
        {
          team: samName.trim(),
          location: 'Roaming',
          status: 'On Break',
          member: samMemberName.trim() ? `${samMemberName.trim()} [${samCert}]` : `${samName.trim()} [${samCert}]`,
        },
      ],
    }));
    setSamName('');
    setSamMemberName('');
    setSamCert('');
    setIsSupervisorModalOpen(false);
  };

  const handleDeleteSupervisor = (idx: number) => {
    updateDraft((current) => ({ ...current, supervisor: current.supervisor.filter((_, i) => i !== idx) }));
  };

  const handleBulkImport = (staff: Staff[], supervisors: Supervisor[]) => {
    updateDraft((current) => ({
      ...current,
      staff: staff.length > 0 ? [...current.staff, ...staff] : current.staff,
      supervisor: supervisors.length > 0 ? [...current.supervisor, ...supervisors] : current.supervisor,
    }));
    setBulkImportMode(null);
  };

  const getCalendarDate = () => {
    if (eventDraft?.date) {
      try {
        return parseDate(eventDraft.date);
      } catch {
        return today(getLocalTimeZone());
      }
    }
    return today(getLocalTimeZone());
  };

  const handleCreateLiteEvent = async () => {
    if (!eventDraft) return;
    if (!eventDraft.name.trim()) {
      alert('Please enter an event name.');
      return;
    }

    const finalized: LiteEventDraft = {
      ...eventDraft,
      status: 'active',
      updatedAt: new Date().toISOString(),
      clinics: syncClinicsFromVenue(eventDraft.venue, eventDraft.clinics),
      dispatchZones: syncDispatchZonesFromVenue(eventDraft.venue, eventDraft.dispatchZones),
    };

    await saveLiteEvent(stripUndefined(finalized));

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`lite_event_${eventDraft.id}`);
    }

    router.push(`/lite/events/${eventDraft.id}/dispatch`);
  };

  if (loading || !eventDraft) {
    return <LoadingScreen label="Loading Lite setup…" />;
  }

  const sectionData = toSectionData(eventDraft);
  const hasVenueEquipment = eventDraft.venue.equipment.length > 0;
  const allPosts = eventDraft.venue.posts;
  const flattenedPosts = allPosts.map((post) => ({ post, layerName: '' }));

  type StepId = 'basics' | 'locations' | 'teams' | 'equipment' | 'postschedule' | 'review';
  const STEP_ORDER: StepId[] = hasVenueEquipment
    ? ['basics', 'locations', 'teams', 'equipment', 'postschedule', 'review']
    : ['basics', 'locations', 'teams', 'postschedule', 'review'];

  const hasRequiredBasics = !!eventDraft.name.trim() && !!eventDraft.date;

  const basicsStep = (
    <div className="px-6 pt-4 h-full overflow-y-auto minimal-scrollbar">
      <MetadataSection
        eventData={sectionData}
        setEventData={
          updateSectionData as unknown as React.Dispatch<
            React.SetStateAction<Partial<Event> & { eventEquipment: EventEquipment[] }>
          >
        }
        getCalendarDate={getCalendarDate}
        scheduleFrom={scheduleFrom}
        setScheduleFrom={setScheduleFrom}
        scheduleTo={scheduleTo}
        setScheduleTo={setScheduleTo}
        inputClassNames={inputClassNames}
      />
    </div>
  );

  const locationListItem = (
    label: string,
    isEditing: boolean,
    editValue: string,
    setEditValue: (v: string) => void,
    onSave: () => void,
    onCancel: () => void,
    onStartEdit: () => void,
    onRemove: () => void,
    key: string
  ) => (
    <Card key={key} radius="sm" className="bg-default/40">
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        {isEditing ? (
          <>
            <Input
              value={editValue}
              onValueChange={setEditValue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSave();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              size="sm"
              autoFocus
              classNames={inputClassNames}
            />
            <button type="button" onClick={onSave} className="p-1 rounded bg-transparent flex-shrink-0" aria-label="Save">
              <Pencil className="h-4 w-4 text-surface-light" />
            </button>
          </>
        ) : (
          <>
            <span className="text-surface-light font-medium truncate leading-normal">{label}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={onStartEdit} className="p-1 rounded bg-transparent" aria-label="Edit">
                <Pencil className="h-4 w-4 text-surface-light" />
              </button>
              <button type="button" onClick={onRemove} className="p-1 rounded bg-transparent" aria-label="Delete">
                <Trash2 className="h-4 w-4 text-status-red" />
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );

  const locationsStep = (
    <div className="flex h-full px-6 pt-4">
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 pb-3 flex items-center justify-between">
          <h3 className="text-surface-light font-semibold text-lg inline-flex items-center gap-1.5">
            Locations
            <Tooltip content="Posts or areas teams can be assigned to and dispatched between during the event (e.g., Main Entrance, First Aid Tent)." placement="top">
              <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
            </Tooltip>
          </h3>
        </div>
        <div className="flex-shrink-0 flex gap-2 pb-3">
          <Input
            placeholder="e.g., Main Entrance"
            value={locationInput}
            onValueChange={setLocationInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLocation();
              }
            }}
            variant="flat"
            classNames={inputClassNames}
          />
          <Button onPress={addLocation} className="flex-shrink-0 h-10 px-4 text-sm text-surface-light bg-default/40 hover:bg-default/60">
            Add
          </Button>
        </div>
        <ScrollShadow className="space-y-2 pr-2 scrollbar-hide flex-1 min-h-0" hideScrollBar style={{ overflow: 'auto' }}>
          {allPosts.map((post, index) =>
            locationListItem(
              getPostName(post),
              editingLocationIndex === index,
              locationEditInput,
              setLocationEditInput,
              saveLocationEdit,
              cancelLocationEdit,
              () => startLocationEdit(index),
              () => removeLocation(index),
              `${getPostName(post)}_${index}`
            )
          )}
        </ScrollShadow>
      </div>

      <div className="w-px bg-surface-liner mx-2 flex-shrink-0" />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 pb-3 flex items-center justify-between">
          <h3 className="text-surface-light font-semibold text-lg inline-flex items-center gap-1.5">
            Equipment
            <Tooltip content="Trackable gear (e.g., a gurney or AED) that can be assigned a default location and its status followed during dispatch." placement="top">
              <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
            </Tooltip>
          </h3>
        </div>
        <div className="flex-shrink-0 flex gap-2 pb-3">
          <Input
            placeholder="e.g., Gurney 1"
            value={equipmentInput}
            onValueChange={setEquipmentInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addEquipment();
              }
            }}
            variant="flat"
            classNames={inputClassNames}
          />
          <Button onPress={addEquipment} className="flex-shrink-0 h-10 px-4 text-sm text-surface-light bg-default/40 hover:bg-default/60">
            Add
          </Button>
        </div>
        <ScrollShadow className="space-y-2 pr-2 scrollbar-hide flex-1 min-h-0" hideScrollBar style={{ overflow: 'auto' }}>
          {eventDraft.venue.equipment.map((item, index) =>
            locationListItem(
              item.name,
              editingEquipmentIndex === index,
              equipmentEditInput,
              setEquipmentEditInput,
              saveEquipmentEdit,
              cancelEquipmentEdit,
              () => startEquipmentEdit(index),
              () => removeEquipment(index),
              item.id
            )
          )}
        </ScrollShadow>
      </div>
    </div>
  );

  const teamsSupervisorsStep = (
    <div className="flex h-full px-6 pt-4">
      <div className="flex-1 min-w-0">
        <TeamStaffingSection
          staff={eventDraft.staff}
          openTeams={openTeams}
          setOpenTeams={setOpenTeams}
          onDeleteTeam={handleDeleteTeam}
          onEditTeam={(idx) => {
            setEditingTeamIndex(idx);
            setIsTeamModalOpen(true);
          }}
          onAddTeam={() => {
            setEditingTeamIndex(null);
            setIsTeamModalOpen(true);
          }}
          onUploadCSV={() => setBulkImportMode('team')}
        />
      </div>
      <div className="w-px bg-surface-liner mx-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <SupervisorStaffingSection
          supervisors={eventDraft.supervisor}
          openSupervisors={openSupervisors}
          setOpenSupervisors={setOpenSupervisors}
          onDeleteSupervisor={handleDeleteSupervisor}
          onUploadCSV={() => setBulkImportMode('supervisor')}
          onAddSupervisor={() => setIsSupervisorModalOpen(true)}
        />
      </div>
    </div>
  );

  const equipmentStep = (
    <div className="flex flex-col h-full overflow-hidden px-3 pt-4">
      <div className="flex-shrink-0 pb-3 pl-3 flex items-center justify-between">
        <h3 className="text-surface-light font-semibold text-xl inline-flex items-center gap-1.5">
          Equipment
          <Tooltip content="Select venue equipment for this event, or add equipment that only exists for this event and won't be saved to the venue." placement="top">
            <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
          </Tooltip>
        </h3>
      </div>
      <EquipmentSelectionSection
        hasVenue
        eventData={sectionData}
        setEventData={updateSectionData}
        selectClassNames={selectClassNames}
        allPosts={allPosts}
        getPostName={getPostName}
      />
    </div>
  );

  const postScheduleStep = (
    <div className="px-6 pt-4 h-full min-h-0 flex flex-col">
      <ScrollShadow className="space-y-4 pr-2 scrollbar-hide flex-1 min-h-0" hideScrollBar style={{ overflow: 'auto' }}>
        <PostsSelectionSection
          hasVenue
          postsEnabled={postsEnabled}
          setPostsEnabled={setPostsEnabled}
          flattenedPosts={flattenedPosts}
          allPosts={allPosts}
          getPostName={getPostName}
          eventData={sectionData}
          setEventData={updateSectionData}
          lastSelectedPostIndex={lastSelectedPostIndex}
          setLastSelectedPostIndex={setLastSelectedPostIndex}
          selectClassNames={selectClassNames}
        />
        <PostingScheduleSection
          postsEnabled={postsEnabled}
          scheduleBy={scheduleBy}
          setScheduleBy={setScheduleBy}
          scheduleChips={scheduleChips}
          setScheduleChips={setScheduleChips}
          editingChipId={editingChipId}
          setEditingChipId={setEditingChipId}
          editingChipValue={editingChipValue}
          setEditingChipValue={setEditingChipValue}
          setPostingTimes={(updater) =>
            updateDraft((current) => ({ ...current, postingTimes: updater(current.postingTimes || []) }))
          }
          inputClassNames={inputClassNames}
        />
      </ScrollShadow>
    </div>
  );

  const reviewColumns: ReviewColumn[] = [
    {
      id: 'basics',
      label: 'Event Configuration',
      fields: [
        { label: 'Event name', value: eventDraft.name.trim() || '(untitled)' },
        { label: 'Date', value: eventDraft.date ? new Date(eventDraft.date).toLocaleDateString() : '—' },
        { label: 'Start / End time', value: `${formatTimeValue(scheduleFrom)} – ${formatTimeValue(scheduleTo)}` },
        { label: 'Surge limit', value: `${eventDraft.surgeLimitPercent ?? 70}%` },
        { label: 'Pending transport surge', value: `${eventDraft.pendingTransportSurgeThreshold ?? 3} patients` },
        {
          label: 'Unassigned call surge',
          value: `${Math.floor((eventDraft.unassignedCallSurgeSeconds ?? 120) / 60)}:${String((eventDraft.unassignedCallSurgeSeconds ?? 120) % 60).padStart(2, '0')}`,
        },
      ],
    },
    {
      id: 'locations',
      label: 'Locations',
      fields: [{ label: 'Locations', value: `${allPosts.length} location${allPosts.length === 1 ? '' : 's'}` }],
    },
    {
      id: 'teams',
      label: 'Staff Assignments',
      fields: [
        { label: 'Teams', value: `${eventDraft.staff.length} team${eventDraft.staff.length === 1 ? '' : 's'}` },
        { label: 'Supervisors', value: `${eventDraft.supervisor.length} supervisor${eventDraft.supervisor.length === 1 ? '' : 's'}` },
      ],
    },
    ...(hasVenueEquipment
      ? [
          {
            id: 'equipment',
            label: 'Equipment',
            fields: [
              { label: 'Equipment', value: `${eventDraft.eventEquipment.length} item${eventDraft.eventEquipment.length === 1 ? '' : 's'}` },
            ],
          },
        ]
      : []),
    {
      id: 'postschedule',
      label: 'Post schedule',
      fields: [
        {
          label: 'Post schedule',
          value: postsEnabled
            ? `${eventDraft.eventPosts.length} post${eventDraft.eventPosts.length === 1 ? '' : 's'} · ${scheduleChips.length} repost time${scheduleChips.length === 1 ? '' : 's'}`
            : 'Not enabled',
        },
      ],
    },
  ];

  const reviewStep = (
    <div className="px-6 pt-4 h-full overflow-y-auto space-y-4">
      <h3 className="text-surface-light font-semibold text-xl mb-1">Review</h3>
      <ReviewColumns columns={reviewColumns} />
    </div>
  );

  const steps: WizardStep[] = [
    { id: 'basics', label: 'Event Configuration', component: basicsStep, isComplete: hasRequiredBasics },
    { id: 'locations', label: 'Locations', component: locationsStep, isComplete: hasRequiredBasics },
    { id: 'teams', label: 'Staff Assignments', component: teamsSupervisorsStep, isComplete: hasRequiredBasics },
    ...(hasVenueEquipment
      ? [{ id: 'equipment', label: 'Equipment', component: equipmentStep, isComplete: hasRequiredBasics }]
      : []),
    { id: 'postschedule', label: 'Post schedule', component: postScheduleStep, isComplete: hasRequiredBasics },
    { id: 'review', label: 'Review', component: reviewStep, isComplete: hasRequiredBasics },
  ];

  const stepIdx = STEP_ORDER.indexOf(currentStepId as (typeof STEP_ORDER)[number]);
  const isFirstStep = stepIdx <= 0;
  const isLastStep = stepIdx === STEP_ORDER.length - 1;
  const goNext = () => {
    if (stepIdx >= 0 && stepIdx < STEP_ORDER.length - 1) setCurrentStepId(STEP_ORDER[stepIdx + 1]);
  };
  const goBack = () => {
    if (stepIdx > 0) setCurrentStepId(STEP_ORDER[stepIdx - 1]);
  };

  const backButton = !isFirstStep && (
    <Button variant="flat" size="md" onPress={goBack} className="px-6">
      Back
    </Button>
  );

  const primaryButton = (
    <Button
      size="md"
      onPress={isLastStep ? handleCreateLiteEvent : goNext}
      isDisabled={currentStepId === 'basics' && !hasRequiredBasics}
      className="px-6 bg-accent hover:bg-accent/90 text-surface-light"
    >
      {isLastStep ? 'Create Event' : 'Continue'}
    </Button>
  );

  return (
    <main className="relative bg-surface-deepest text-surface-light h-full overflow-hidden leading-none">
      <div className="relative z-10 max-w-[1200px] mx-auto h-full overflow-hidden flex flex-col">
        <div className="px-6 pt-4 flex-shrink-0">
          <StepProgress steps={steps} currentStepId={currentStepId} onStepChange={setCurrentStepId} />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col h-full relative overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden pt-2 pb-4">
              <WizardShell
                steps={steps}
                currentStepId={currentStepId}
                onStepChange={setCurrentStepId}
                hideProgress
                className="flex-1 min-h-0 px-0"
              />
            </div>
            <div className="flex items-center justify-between px-6 pt-4 pb-4 flex-shrink-0">
              <div>{backButton}</div>
              <div>{primaryButton}</div>
            </div>
          </div>
        </div>
      </div>

      <AddTeamModal
        isOpen={isTeamModalOpen}
        onClose={() => {
          setIsTeamModalOpen(false);
          setEditingTeamIndex(null);
        }}
        mode={editingTeamIndex !== null ? 'edit' : 'create'}
        titleOverride={editingTeamIndex !== null ? 'Edit Team' : 'Add New Team'}
        submitLabelOverride={editingTeamIndex !== null ? 'Save Changes' : undefined}
        existingTeamNames={eventDraft.staff.map((s) => s.team).filter((_, i) => i !== editingTeamIndex)}
        initialTeam={editingTeamIndex !== null ? parseTeamForEdit(eventDraft.staff[editingTeamIndex]) : undefined}
        onSave={(team) => handleSaveTeam(team)}
        roles={LICENSES.map((name) => ({ name, fullName: name }))}
      />

      <AddSupervisorModal
        isOpen={isSupervisorModalOpen}
        onClose={() => setIsSupervisorModalOpen(false)}
        mode="create"
        onSubmit={handleAddSamUnit}
        titleOverride="Add New Supervisor"
        submitLabelOverride="Add Supervisor"
        teamName={samName}
        setTeamName={setSamName}
        memberName={samMemberName}
        setMemberName={setSamMemberName}
        memberCert={samCert}
        setMemberCert={setSamCert}
        roles={LICENSES.map((name) => ({ name, fullName: name }))}
      />

      <BulkImportModal
        isOpen={bulkImportMode !== null}
        onClose={() => setBulkImportMode(null)}
        mode={bulkImportMode || 'team'}
        roles={LICENSES.map((name) => ({ name, fullName: name }))}
        existingTeamNames={
          bulkImportMode === 'supervisor' ? eventDraft.supervisor.map((s) => s.team) : eventDraft.staff.map((s) => s.team)
        }
        onImport={handleBulkImport}
      />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LiteCreateContent />
    </Suspense>
  );
}
