'use client';

import { useRouter, useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { Event, Venue, Staff, Supervisor, Post, Equipment, EventEquipment } from '@/app/types';
import { authService, dbService } from '@/lib/services';
import { Button, Card, ScrollShadow } from '@heroui/react';
import { parseDate, getLocalTimeZone, today } from '@internationalized/date';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { syncClinicsFromVenue } from '@/lib/clinics';
import { syncDispatchZonesFromVenue } from '@/lib/zones';
import MapZoomControls from '@/components/ui/map-zoom-controls';
import { useScheduleGeneration } from '@/hooks/useScheduleGeneration';
import { scheduleTimesToWindow, formatTimeValue } from '@/lib/scheduleUtils';
import { useCertifications } from '@/hooks/useCertifications';
import MetadataSection from '@/components/event-create/MetadataSection';
import TeamStaffingSection from '@/components/event-create/TeamStaffingSection';
import SupervisorStaffingSection from '@/components/event-create/SupervisorStaffingSection';
import PostingScheduleSection from '@/components/event-create/PostingScheduleSection';
import { EquipmentSelectionSection, PostsSelectionSection } from '@/components/event-create/PostsEquipmentSection';
import { WizardShell, StepProgress, ReviewColumns, type WizardStep, type ReviewColumn } from '@/components/wizard';
import { stripUndefined } from '@/lib/utils';
import AddTeamModal, { TeamDraft } from '@/components/modals/event/addteammodal';
import AddSupervisorModal from '@/components/modals/event/addsupervisormodal';
import BulkImportModal from '@/components/modals/event/bulkimportmodal';
import { VenueMapWithPosts } from '@/components/modals/event/venuemapmodal';
import { MAP_CHECKER_BG } from '@/lib/mapStyles';
import LoadingScreen from '@/components/ui/loading-screen';

// Helper to get post name regardless of type
const getPostName = (post: Post): string => {
  return typeof post === 'string' ? post : post.name;
};


export default function EventCreation() {
  const router = useRouter();
  const params = useParams();
  const eventId = params?.eventId as string | undefined;

  const { certifications } = useCertifications();

  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState<Partial<Event> & { eventEquipment: EventEquipment[] }>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    venue: {} as Venue,
    staff: [],
    supervisor: [],
    postingTimes: [],
    userId: '',
    calls: [],
    eventPosts: [],
    eventEquipment: [],
    surgeLimitPercent: 70,
    pendingTransportSurgeThreshold: 3,
    unassignedCallSurgeSeconds: 120,
  });

  // A venue with no equipment of its own skips the Equipment step entirely.
  const hasVenueEquipment = (eventData.venue?.equipment?.length ?? 0) > 0;
  type StepId = 'basics' | 'teams' | 'equipment' | 'postschedule' | 'review';
  const STEP_ORDER: StepId[] = hasVenueEquipment
    ? ['basics', 'teams', 'equipment', 'postschedule', 'review']
    : ['basics', 'teams', 'postschedule', 'review'];
  const [currentStepId, setCurrentStepId] = useState<string>('basics');
  const [currentLayer, setCurrentLayer] = useState(0);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [bulkImportMode, setBulkImportMode] = useState<'team' | 'supervisor' | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const submittedRef = useRef(false);

  // Pan/zoom state, mirroring the dispatch page's own venue map modal
  // (VenueMapModal) exactly, since VenueMapWithPosts is shared with it.
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setPosition({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handleMouseUp = () => setIsPanning(false);

  const [postsEnabled, setPostsEnabled] = useState(false);

  // enabled must track postsEnabled — without it, postingTimes is always
  // generated regardless of whether "Enable Posts" is checked, which made
  // the navbar's "Posting Schedule" item show up for every event (it goes
  // off event.postingTimes.length > 0).
  const {
    scheduleFrom,
    setScheduleFrom,
    scheduleTo,
    setScheduleTo,
    scheduleBy,
    setScheduleBy,
    postingTimes,
  } = useScheduleGeneration({ initialBy: '480', enabled: postsEnabled });

  const [samName, setSamName] = useState('');
  const [samMemberName, setSamMemberName] = useState('');
  const [samCert, setSamCert] = useState('');
  const [openTeams, setOpenTeams] = useState<Record<number, boolean>>({});
  const [openSupervisors, setOpenSupervisors] = useState<Record<number, boolean>>({});
  const [lastSelectedPostIndex, setLastSelectedPostIndex] = useState<number | null>(null);
  const [scheduleChips, setScheduleChips] = useState<{ id: string; time: string; editable: boolean }[]>([]);
  const [editingChipId, setEditingChipId] = useState<string | null>(null);
  const [editingChipValue, setEditingChipValue] = useState('');

  // Recompute container size on resize
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Generate schedule chips based on time range and interval
  useEffect(() => {
    const times = postingTimes;
    if (times.length === 0) {
      setScheduleChips([]);
      setEventData(prev => ({ ...prev, postingTimes: [] }));
      return;
    }

    const chips = times.map((timeStr) => ({
      id: crypto.randomUUID(),
      time: timeStr,
      editable: false,
    }));

    setScheduleChips(chips);
    setEventData(prev => ({ ...prev, postingTimes: times }));
  }, [postingTimes]);

  // Keep the event's own start/end — used for reporting (the summary
  // page's analytics window) independent of whether auto-posting is
  // enabled — in sync with the Schedule section's From/To fields.
  useEffect(() => {
    const { start, end } = scheduleTimesToWindow(eventData.date || new Date().toISOString(), scheduleFrom, scheduleTo);
    setEventData(prev => ({ ...prev, scheduleStart: start, scheduleEnd: end }));
  }, [scheduleFrom, scheduleTo, eventData.date]);

  // Autosave postingTimes to the draft event document when they change.
  // Debounced to avoid excessive writes while the user is adjusting inputs.
  useEffect(() => {
    if (!eventId) return;
    const times = eventData.postingTimes || [];
    const timeout = setTimeout(async () => {
      try {
        await dbService.updateDocument('events', eventId, stripUndefined({ postingTimes: times }) as Record<string, unknown>);
        // eslint-disable-next-line no-console
        console.log('Autosaved postingTimes to draft:', { eventId, postingTimes: times });
      } catch (err) {
        console.error('Failed to autosave postingTimes:', err);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [eventId, eventData.postingTimes]);

  type FirestoreTimestamp = { seconds: number; nanoseconds: number };

  useEffect(() => {
    if (eventId) {
          
      const fetchEvent = async () => {
        try {
          const docSnap = await dbService.getDocument<Event>('events', eventId);

          if (docSnap.exists && docSnap.data) {
            const data = docSnap.data;
            
            
            let dateString = '';
            if (typeof data.date === 'string') {
              const d = new Date(data.date);
              dateString = isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
            } else if (
              typeof data.date === 'object' &&
              data.date !== null &&
              'seconds' in data.date &&
              typeof (data.date as FirestoreTimestamp).seconds === 'number'
            ) {
              const ts = data.date as FirestoreTimestamp;
              const d = new Date(ts.seconds * 1000);
              dateString = d.toISOString().split('T')[0];
            }
            
            // Migrate old venue format to new format with layers
            let venue = data.venue;
            if (venue && !venue.layers) {
              
              // Convert old format to new format
              venue = {
                ...venue,
                layers: [{
                  id: crypto.randomUUID(),
                  name: 'Main Floor',
                  posts: venue.posts || [],
                  mapUrl: venue.mapUrl,
                }]
              };
            }
            
            // Ensure eventEquipment is initialized and venue structure is preserved
            const updatedData = { 
              ...data, 
              date: dateString,
              eventEquipment: data.eventEquipment || [],
              venue: venue || {} as Venue
            };
            
            
            
            setEventData(updatedData);
          } else {
            console.error('Event document does not exist!');
          }
        } catch (error) {
          console.error('Error fetching event:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchEvent();
    } else {
        const createDraft = async () => {
        setLoading(true);
        const user = authService.currentUser;
        if (!user) {
          setLoading(false);
          return;
        }
          // Ensure postingTimes are computed and included in the draft at creation time
          const times = postingTimes;

          const draft = {
            ...eventData,
            postingTimes: times.length > 0 ? times : eventData.postingTimes,
            userId: user.uid,
            date: new Date(eventData.date!).toISOString(),
            createdAt: new Date().toISOString(),
            status: 'draft',
          };
        const newId = await dbService.addDocument('events', stripUndefined(draft));
        setEventData(prev => ({ ...prev, userId: user.uid }));
        router.replace(`/events/${newId}/create`);
        setLoading(false);
      };
      createDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup effect - disabled to prevent deleting events during page reloads
  // The venue selection page handles cleanup of old abandoned drafts
  // useEffect(() => {
  //   return () => {
  //     if (!submittedRef.current && eventId) {
  //       const docRef = doc(db, 'events', eventId);
  //       getDoc(docRef).then(docSnap => {
  //         if (docSnap.exists()) {
  //           const data = docSnap.data() as Partial<Event> | undefined;
  //           if (data?.status === 'draft') {
  //             deleteDoc(docRef);
  //           }
  //         }
  //       });
  //     }
  //   };
  // }, [eventId]);

  const handleSaveTeam = (team: TeamDraft, editIdx: number | null) => {
    const members = team.members.map(
      m => `${m.name} [${m.cert}]${m.lead ? " (Lead)" : ""}`
    );
    setEventData(prev => {
      if (editIdx !== null) {
        const staff = [...(prev.staff || [])];
        staff[editIdx] = { ...staff[editIdx], team: team.name, members };
        return { ...prev, staff };
      }
      const newStaff: Staff = {
        team: team.name,
        location: "No Post",
        status: "On Break",
        members,
      };
      return { ...prev, staff: [...(prev.staff || []), newStaff] };
    });
  };

  // Reverses the "Name [CERT] (Lead)" string format handleSaveTeam writes,
  // so an existing Staff record can prefill AddTeamModal for editing.
  const parseTeamForEdit = (team: Staff): TeamDraft => ({
    name: team.team,
    members: team.members.map((m) => {
      const match = m.match(/^(.*) \[(.*)\](?: \(Lead\))?$/);
      const lead = / \(Lead\)$/.test(m);
      if (!match) return { name: m, cert: '', lead };
      return { name: match[1], cert: match[2], lead };
    }),
  });

  const handleAddSamUnit = () => {
    if (!samName.trim() || !samCert) return;
    const newSupervisor: Supervisor = {
      team: samName.trim(),
      location: 'Roaming',
      status: 'On Break',
      member: samMemberName.trim() ? `${samMemberName.trim()} [${samCert}]` : `${samName.trim()} [${samCert}]`,
    };
    setEventData(prev => ({
      ...prev,
      supervisor: [...(prev.supervisor || []), newSupervisor]
    }));
    setSamName('');
    setSamMemberName('');
    setSamCert('');
    setIsSupervisorModalOpen(false);
  };

  const handleBulkImport = (staff: Staff[], supervisors: Supervisor[]) => {
    setEventData(prev => ({
      ...prev,
      staff: staff.length > 0 ? [...(prev.staff || []), ...staff] : prev.staff,
      supervisor: supervisors.length > 0 ? [...(prev.supervisor || []), ...supervisors] : prev.supervisor,
    }));
    setBulkImportMode(null);
  };

  const handleSubmit = async () => {
    submittedRef.current = true;
    try {
      const user = authService.currentUser;
      if (!user) {
        alert('You must be logged in to create an event.');
        return;
      }
      if (!eventData.name?.trim()) {
        alert('Please enter an event name.');
        return;
      }
      const dateValue = new Date(eventData.date!);
      if (isNaN(dateValue.getTime())) {
        alert('Invalid event date');
        return;
      }

      // Compute postingTimes right before save in case state hasn't flushed.
      const computedTimes = postingTimes;
      console.log('handleSubmit computed postingTimes:', computedTimes, 'eventData.postingTimes:', eventData.postingTimes);

      // Populate clinics from venue-designated clinic posts right before save.
      const computedClinics = syncClinicsFromVenue(eventData.venue, eventData.clinics);
      // Same, for venue-designated dispatch zones.
      const computedDispatchZones = syncDispatchZonesFromVenue(eventData.venue, eventData.dispatchZones);

      let eventDocId = eventId;
      if (eventDocId) {
        try {
          const docSnap2 = await dbService.getDocument('events', eventDocId);
          if (docSnap2.exists) {
            await dbService.updateDocument('events', eventDocId, stripUndefined({
              ...eventData,
              postingTimes: computedTimes.length > 0 ? computedTimes : eventData.postingTimes,
              clinics: computedClinics,
              dispatchZones: computedDispatchZones,
              userId: user.uid,
              date: dateValue.toISOString(),
              updatedAt: new Date().toISOString(),
              status: 'active',
            }) as Record<string, unknown>);
            // eslint-disable-next-line no-console
            console.log('Event updated:', { eventId: eventDocId, postingTimes: eventData.postingTimes || [] });
          } else {
            eventDocId = await dbService.addDocument('events', stripUndefined({
              ...eventData,
              postingTimes: computedTimes.length > 0 ? computedTimes : eventData.postingTimes,
              clinics: computedClinics,
              dispatchZones: computedDispatchZones,
              userId: user.uid,
              date: dateValue.toISOString(),
              createdAt: new Date().toISOString(),
              status: 'active',
            }));
            // eslint-disable-next-line no-console
            console.log('Event created (branch new):', { eventId: eventDocId, postingTimes: eventData.postingTimes || [] });
          }
        } catch (error) {
          console.error('Error checking/updating document:', error);
          eventDocId = await dbService.addDocument('events', stripUndefined({
            ...eventData,
            clinics: computedClinics,
            dispatchZones: computedDispatchZones,
            userId: user.uid,
            date: dateValue.toISOString(),
            createdAt: new Date().toISOString(),
            status: 'active',
          }));
          // eslint-disable-next-line no-console
          console.log('Event created (catch):', { eventId: eventDocId, postingTimes: eventData.postingTimes || [] });
        }
      } else {
        eventDocId = await dbService.addDocument('events', stripUndefined({
          ...eventData,
          clinics: computedClinics,
          dispatchZones: computedDispatchZones,
          userId: user.uid,
          date: dateValue.toISOString(),
          createdAt: new Date().toISOString(),
          status: 'active',
        }));
        // eslint-disable-next-line no-console
        console.log('Event created (no eventId):', { eventId: eventDocId, postingTimes: eventData.postingTimes || [] });
      }
      router.push(`/events/${eventDocId}/dispatch`);
    } catch (error) {
      console.error('Creation failed:', error);
      alert(`Creation failed: ${(error as Error).message}`);
    }
  };


  useEffect(() => {
    if (eventData.venue && Object.keys(eventData.venue).length > 0) {
    }
  }, [eventData.venue]);

  // Debug effect to find overflow source
  // (debugging useEffect removed)

  if (loading) return <LoadingScreen label="Loading event data…" />;
  
  const hasVenue = Boolean(eventData.venue?.name && eventData.venue?.layers?.length);
  const hasMap = hasVenue && Boolean(eventData.venue?.layers?.[currentLayer]?.mapUrl);
  const allPosts = hasVenue ? (eventData.venue?.layers?.flatMap(layer => layer.posts || []) || []) : [];
  const flattenedPosts = hasVenue ? (eventData.venue?.layers?.flatMap(layer => (layer.posts || []).map(p => ({ post: p, layerName: layer.name }))) || []) : [];

  

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

  const handleDeleteTeam = (idx: number) => {
    setEventData(prev => ({
      ...prev,
      staff: (prev.staff || []).filter((_, i) => i !== idx),
    }));
  };

  const handleDeleteSupervisor = (idx: number) => {
    setEventData(prev => ({
      ...prev,
      supervisor: (prev.supervisor || []).filter((_, i) => i !== idx),
    }));
  };

  // Convert date string to CalendarDate
  const getCalendarDate = () => {
    if (eventData.date) {
      try {
        return parseDate(eventData.date);
      } catch {
        return today(getLocalTimeZone());
      }
    }
    return today(getLocalTimeZone());
  };

  const basicsStep = (
    <div className="px-6 pt-4 h-full overflow-y-auto minimal-scrollbar">
      <MetadataSection
        eventData={eventData}
        setEventData={setEventData}
        getCalendarDate={getCalendarDate}
        scheduleFrom={scheduleFrom}
        setScheduleFrom={setScheduleFrom}
        scheduleTo={scheduleTo}
        setScheduleTo={setScheduleTo}
        inputClassNames={inputClassNames}
      />
    </div>
  );

  const teamsSupervisorsStep = (
    <div className="flex h-full px-6 pt-4">
      <div className="flex-1 min-w-0">
        <TeamStaffingSection
          staff={eventData.staff || []}
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
          supervisors={eventData.supervisor || []}
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
        <h3 className="text-surface-light font-semibold text-xl">Equipment</h3>
      </div>
      <EquipmentSelectionSection
        hasVenue={hasVenue}
        eventData={eventData as Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] }}
        setEventData={setEventData as React.Dispatch<React.SetStateAction<Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] }>>}
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
          hasVenue={hasVenue}
          postsEnabled={postsEnabled}
          setPostsEnabled={setPostsEnabled}
          flattenedPosts={flattenedPosts}
          allPosts={allPosts}
          getPostName={getPostName}
          eventData={eventData as Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] }}
          setEventData={setEventData as React.Dispatch<React.SetStateAction<Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] }>>}
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
            setEventData((prev) => ({
              ...prev,
              postingTimes: updater(prev.postingTimes || []),
            }))
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
        { label: 'Event name', value: eventData.name?.trim() || '(untitled)' },
        { label: 'Venue', value: eventData.venue?.name || '(none)' },
        { label: 'Date', value: eventData.date ? new Date(eventData.date).toLocaleDateString() : '—' },
        { label: 'Start / End time', value: `${formatTimeValue(scheduleFrom)} – ${formatTimeValue(scheduleTo)}` },
        { label: 'Surge limit', value: `${eventData.surgeLimitPercent ?? 70}%` },
        { label: 'Pending transport surge', value: `${eventData.pendingTransportSurgeThreshold ?? 3} patients` },
        {
          label: 'Unassigned call surge',
          value: `${Math.floor((eventData.unassignedCallSurgeSeconds ?? 120) / 60)}:${String((eventData.unassignedCallSurgeSeconds ?? 120) % 60).padStart(2, '0')}`,
        },
      ],
    },
    {
      id: 'teams',
      label: 'Staff Assignments',
      fields: [
        { label: 'Teams', value: `${(eventData.staff || []).length} team${(eventData.staff || []).length === 1 ? '' : 's'}` },
        { label: 'Supervisors', value: `${(eventData.supervisor || []).length} supervisor${(eventData.supervisor || []).length === 1 ? '' : 's'}` },
      ],
    },
    ...(hasVenueEquipment
      ? [
          {
            id: 'equipment',
            label: 'Equipment',
            fields: [
              { label: 'Equipment', value: `${eventData.eventEquipment.length} item${eventData.eventEquipment.length === 1 ? '' : 's'}` },
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
            ? `${(eventData.eventPosts || []).length} post${(eventData.eventPosts || []).length === 1 ? '' : 's'} · ${scheduleChips.length} repost time${scheduleChips.length === 1 ? '' : 's'}`
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

  // Event name and date are required before advancing past Event Configuration.
  const hasRequiredBasics = !!eventData.name?.trim() && !!eventData.date;

  // A venue with nothing defined in its own equipment list has nothing for
  // this step to offer beyond the "event only" add flow — skip it entirely
  // rather than show an empty tab.
  const steps: WizardStep[] = [
    { id: 'basics', label: 'Event Configuration', component: basicsStep, isComplete: hasRequiredBasics },
    { id: 'teams', label: 'Staff Assignments', component: teamsSupervisorsStep, isComplete: hasRequiredBasics },
    ...(hasVenueEquipment
      ? [{ id: 'equipment', label: 'Equipment', component: equipmentStep, isComplete: hasRequiredBasics }]
      : []),
    { id: 'postschedule', label: 'Post schedule', component: postScheduleStep, isComplete: hasRequiredBasics },
    { id: 'review', label: 'Review', component: reviewStep, isComplete: hasRequiredBasics },
  ];

  const showMapPanel = currentStepId === 'equipment' || currentStepId === 'postschedule';
  const showMapColumn = showMapPanel && hasMap;

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

  // The last step's primary action creates the event instead of advancing.
  const primaryButton = (
    <Button
      size="md"
      onPress={isLastStep ? handleSubmit : goNext}
      isDisabled={currentStepId === 'basics' && !hasRequiredBasics}
      className="px-6 bg-accent hover:bg-accent/90 text-surface-light"
    >
      {isLastStep ? 'Create Event' : 'Continue'}
    </Button>
  );

  const leftPanelContent = (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden pt-2 pb-4">
        <WizardShell
          steps={steps}
          currentStepId={currentStepId}
          onStepChange={setCurrentStepId}
          hideProgress
          className={`flex-1 min-h-0 pl-6 ${showMapColumn ? 'pr-3' : 'pr-6'}`}
        />
      </div>

      {showMapColumn ? (
        <div className="flex pl-6 pr-3 pt-4 pb-4 flex-shrink-0">{backButton}</div>
      ) : (
        <div className="flex items-center justify-between px-6 pt-4 pb-4 flex-shrink-0">
          <div>{backButton}</div>
          <div>{primaryButton}</div>
        </div>
      )}
    </div>
  );

  const rightPanelContent = (
    <div className="flex flex-col h-full relative pl-3 pr-6 pt-4 pb-4 overflow-hidden">
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        {/* Map — this panel only renders when showMapColumn is true, which already
            requires hasMap, so there's no "no map" fallback to render here. Reuses
            the same VenueMapWithPosts marker/icon rendering and pan/zoom behavior
            as the dispatch page's own venue map modal. */}
        <div className="w-full flex flex-col flex-1 min-h-0">
          <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-t-sm" style={MAP_CHECKER_BG}>
            <VenueMapWithPosts
              layers={eventData.venue?.layers || []}
              currentLayer={currentLayer}
              staff={eventData.staff || []}
              equipment={(eventData.eventEquipment || []).map((e) => ({ ...e, location: e.defaultLocation }))}
              teamTimers={{}}
              calls={eventData.calls || []}
              clinics={eventData.clinics || []}
              scale={scale}
              position={position}
              isPanning={isPanning}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              imgRef={imgRef}
              imageRadiusClassName="rounded-none"
            />

            <MapZoomControls
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleResetZoom}
              buttonClassName="bg-surface-deepest/90 backdrop-blur"
              resetButtonClassName="bg-surface-deepest/90 backdrop-blur"
            />
          </div>

          {/* Bottom Control Bar — merges flush with the map above: square where
              they meet, sharp radius only at the map's top and this bar's bottom. */}
          <Card
            radius="none"
            className="rounded-b-sm bg-default/40 w-full px-3 py-2 flex-shrink-0"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-light">Layer:</span>
                <span className="text-sm font-medium text-surface-light">
                  {eventData.venue?.layers?.[currentLayer]?.name || 'Main Floor'}
                </span>
              </div>
              {eventData.venue?.layers && eventData.venue.layers.length > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    isIconOnly
                    size="sm"
                    radius="full"
                    variant="flat"
                    onPress={() => setCurrentLayer(prev => Math.max(0, prev - 1))}
                    isDisabled={currentLayer === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-surface-light">
                    {currentLayer + 1} / {eventData.venue.layers.length}
                  </span>
                  <Button
                    isIconOnly
                    size="sm"
                    radius="full"
                    variant="flat"
                    onPress={() => setCurrentLayer(prev => Math.min((eventData.venue?.layers?.length || 1) - 1, prev + 1))}
                    isDisabled={currentLayer === (eventData.venue?.layers?.length || 1) - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex justify-end pt-4 flex-shrink-0">{primaryButton}</div>
    </div>
  );

  return (
    <main className="relative bg-surface-deepest text-surface-light h-[calc(100dvh-3.5rem)] overflow-hidden leading-none">
      <div className="relative z-10 max-w-[1200px] mx-auto h-full overflow-hidden flex flex-col">
        <div className="px-6 pt-4 flex-shrink-0">
          <StepProgress steps={steps} currentStepId={currentStepId} onStepChange={setCurrentStepId} />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="flex h-full overflow-hidden">
            {showMapColumn ? (
              <>
                <div className="w-1/2 h-full flex-shrink-0 overflow-hidden">
                  {leftPanelContent}
                </div>
                <div className="w-1/2 h-full flex-shrink-0 overflow-hidden">
                  {rightPanelContent}
                </div>
              </>
            ) : (
              <div className="w-full h-full overflow-hidden">
                {leftPanelContent}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddTeamModal
        isOpen={isTeamModalOpen}
        onClose={() => {
          setIsTeamModalOpen(false);
          setEditingTeamIndex(null);
        }}
        mode={editingTeamIndex !== null ? 'edit' : 'create'}
        titleOverride={editingTeamIndex !== null ? 'Edit Team' : 'Add New Team'}
        submitLabelOverride={editingTeamIndex !== null ? 'Save Changes' : undefined}
        existingTeamNames={(eventData.staff || [])
          .map(s => s.team)
          .filter((_, i) => i !== editingTeamIndex)}
        initialTeam={editingTeamIndex !== null ? parseTeamForEdit((eventData.staff || [])[editingTeamIndex]) : undefined}
        onSave={(team) => handleSaveTeam(team, editingTeamIndex)}
        roles={certifications.map(name => ({ name, fullName: name }))}
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
        roles={certifications.map(name => ({ name, fullName: name }))}
      />

      <BulkImportModal
        isOpen={bulkImportMode !== null}
        onClose={() => setBulkImportMode(null)}
        mode={bulkImportMode || 'team'}
        roles={certifications.map(name => ({ name, fullName: name }))}
        existingTeamNames={
          bulkImportMode === 'supervisor'
            ? (eventData.supervisor || []).map(s => s.team)
            : (eventData.staff || []).map(s => s.team)
        }
        onImport={handleBulkImport}
      />
    </main>
  );
}
