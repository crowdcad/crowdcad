'use client';
import { useEffect, useMemo, useState, useRef, useCallback, use, lazy, Suspense } from 'react';
import PostingScheduleModal from '@/components/modals/event/postingschedulemodal';
import VenueMapTab, { type TeamFocusRequest, type SupervisorFocusRequest, type EquipmentFocusRequest } from '@/components/dispatch/venuemaptab';
import type { MapOverlay } from '@/components/modals/event/venuemapmodal';
import EventSummaryModal from '@/components/modals/event/eventsummarymodal';
import QuickCallModal from "@/components/modals/event/quickcallmodal";
import ClinicWalkupModal from "@/components/dispatch/clinicwalkupmodal";
import AddTeamModal, { TeamDraft } from "@/components/modals/event/addteammodal";
import AddSupervisorModal from "@/components/modals/event/addsupervisormodal";
import AddEquipmentModal from "@/components/modals/event/addequipmentmodal";
import EndEventModal from "@/components/modals/event/endeventmodal";
import TransportUnitModal from "@/components/modals/event/transportunitmodal";
import React from 'react';
import { dbService, ServiceError } from '@/lib/services';
import { PostAssignment, Event, Staff, Supervisor, Call, EquipmentStatus, CallLogEntry, TeamLogEntry, EquipmentItem, EventEquipment, ClinicOutcome, Clinic, Layer, DispatchZone } from '@/app/types';
import { toast, Slide, ToastContainer } from 'react-toastify';
import { useRouter } from 'next/navigation';
import isEqual from 'lodash.isequal';
import { useAuth } from '@/hooks/useauth';
import { useAdmin } from '@/hooks/useAdmin';
import { useCertifications } from '@/hooks/useCertifications';
import { useLiteMode } from '@/lib/LiteContext';
import { deleteLiteEvent, getLiteEvent, saveLiteEvent } from '@/lib/liteEventStore';
import { Map as MapIcon, Users, BriefcaseMedical, HousePlus } from "lucide-react";
import { FaWalkieTalkie } from "react-icons/fa6";
import DispatchMotionCell from '@/components/dispatch/motioncell';
import { useIsMobile } from '@/hooks/use-mobile';
import { CallTrackingTable } from '@/components/dispatch/calltracking';
import ClinicTrackingTable from '@/components/dispatch/clinictracking';
import CallTrackingCard from '@/components/dispatch/calltrackingcard';
import ClinicTrackingCard from '@/components/dispatch/clinictrackingcard';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import DebugModal from '@/components/modals/debugmodal';
import { ShieldAlert } from 'lucide-react';
import { Select, SelectItem, Tabs, Tab, Button, Tooltip } from "@heroui/react"
import AvailabilitySurgeStrip from '@/components/dispatch/availabilitysurgestrip';
import SurgeToggleButton from '@/components/dispatch/surgetogglebutton';
import PanelTab from '@/components/dispatch/paneltab';
import DuplicateCallModal from '@/components/modals/event/duplicatecallmodal';
import { CallSortButton, CallZoneFilterButton, TeamActionButtonGroup, type LeftPanelTab } from '@/components/dispatch/dispatchcontrols';
import { TeamList, SupervisorList, EquipmentList, type TeamListProps, type SupervisorListProps, type EquipmentListProps } from '@/components/dispatch/leftpanellists';
import { TrackingInsightsRow } from '@/components/dispatch/trackinginsights';
import { getTeamAvailabilitySummary, getSurgeLimitPercent, isSurging, getPendingTransportSurgeThreshold, getUnassignedCallSurgeSeconds, countPendingTransport } from '@/lib/teamAvailability';
import LoadingScreen from '@/components/ui/loading-screen';
import { normalizeLiteDraftToEvent, removeUndefinedDeep, toLiteDraftFromEvent } from '@/lib/liteEventAdapters';
import { getRowStatusClass } from '@/lib/statusColors';
import { syncClinicsFromVenue, getEventClinics, getClinicName, isClinicCallResolved, RESOLVED_CALL_STATUSES } from '@/lib/clinics';
import { syncDispatchZonesFromVenue, getEventDispatchZones, getCallZoneIds, getEventVenueLayers } from '@/lib/zones';
import { withPendingSuffix } from '@/lib/callTiming';
import { sortActiveCalls, type CallSortMode } from '@/lib/callSort';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import { DispatchVocabularyProvider } from '@/lib/dispatchVocabulary/context';
import { isEventEnded } from '@/lib/eventStatus';
import { buildLogSummaryCsv } from '@/lib/csvFormat';
import { downloadTextFile } from '@/lib/downloadFile';
import { formatAgeSex, parseAgeSex } from '@/lib/ageSex';
import { getActivePostingTime } from '@/lib/postingTimes';
import { keepTrackedLocations } from '@/lib/teamLocationGuard';
import type { UnitTracking } from '@/lib/unitTracking';
import { stampStatusSince, deriveStatusSinceFromLogs } from '@/lib/teamStatusSince';
import { newTeamId } from '@/lib/teamId';
import { isGeoLayer } from '@/lib/geo/layers';
import { isPlacedPost } from '@/lib/geo/positions';

// TAK live tracking (optional, in development): loaded only for TAK events,
// and compiled out entirely unless NEXT_PUBLIC_TAK is exactly "on".
// React.lazy rather than next/dynamic: with the flag off this adds nothing to the page.
const TakEventPanel =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakEventPanel }))) : null;
const TakEventAgent =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakEventAgent }))) : null;
const TakBasemapUnderlay =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakBasemapUnderlay }))) : null;
const TakBasemapToolbar =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakBasemapToolbar }))) : null;

interface DispatchRoutePageProps {
  params: Promise<{ eventId: string }>;
}

// function StatusTimer({ since }: { since: number })  {
//   const [elapsed, setElapsed] = React.useState(0);

//   React.useEffect(() => {
//     setElapsed(Math.floor((Date.now() - since) / 1000));
//     const interval = setInterval(() => {
//       setElapsed(Math.floor((Date.now() - since) / 1000));
//     }, 1000);
//     return () => clearInterval(interval);
//   }, [since]);

//   const minutes = Math.floor(elapsed / 60);
//   const seconds = elapsed % 60;
//   return (
//     <span>
//       {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
//     </span>
//   );
// }

const LEFT_PANEL_TABS: LeftPanelTab[] = ['teams', 'supervisors', 'equipment'];


export default function DispatchPage({ params }: DispatchRoutePageProps) {
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [postAssignments, setPostAssignments] = useState<PostAssignment>({});
  // Live unit positions on a TAK event, reported by the TAK module's agent (D66).
  const [unitTracking, setUnitTracking] = useState<UnitTracking | null>(null);
  // const handleBulkPostAssignment = (newAssignments: PostAssignment) => {
  //   setPostAssignments(newAssignments);
  // };
  const { eventId } = use(params);
  const { isLiteMode: layoutLiteMode } = useLiteMode();
  const isLiteMode = layoutLiteMode;
  const { user: authUser, ready: authReady } = useAuth();
  const user = isLiteMode ? null : authUser;
  const ready = isLiteMode ? true : authReady;
  const { isAdmin: isOrgAdmin } = useAdmin();
  const { activePreset: dispatchVocabularyPreset } = useDispatchVocabulary();
  const vocabularyTerms = dispatchVocabularyPreset.terms;
  const t = useCallback((key: string) => vocabularyTerms[key] ?? key, [vocabularyTerms]);
  const router = useRouter();

  const wasSurgingRef = useRef(false);
  useEffect(() => {
    if (!event) return;
    const summary = getTeamAvailabilitySummary(event);
    if (summary.total === 0) {
      wasSurgingRef.current = false;
      return;
    }
    const surging = isSurging(summary.percentOnCalls, getSurgeLimitPercent(event));
    if (surging && !wasSurgingRef.current) {
      toast.warning(`${t('Surge limit reached')} (${summary.percentOnCalls}%)`, {
        position: 'top-right',
        autoClose: 10000,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
    }
    wasSurgingRef.current = surging;
  }, [event, t]);

  // Shared by the surge toast below and the surge auto-activation effect
  // further down — both compare it against the same configurable threshold.
  const pendingTransportCount = useMemo(() => (event ? countPendingTransport(event) : 0), [event]);

  const wasPendingTransportSurgingRef = useRef(false);
  useEffect(() => {
    if (!event) return;
    const surging = pendingTransportCount >= getPendingTransportSurgeThreshold(event);
    if (surging && !wasPendingTransportSurgingRef.current) {
      toast.warning(`${t('Surge alert: multiple clinic calls pending transport')} (${pendingTransportCount})`, {
        position: 'top-right',
        autoClose: 10000,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
    }
    wasPendingTransportSurgingRef.current = surging;
  }, [event, pendingTransportCount, t]);

  // Pending-call alarm: fires once per call, the moment it's been sitting
  // Pending (no assigned team) for 1+ minute. Unlike the surge-percent
  // effect above, nothing about a Pending call's own data changes while
  // it waits, so this has to poll wall-clock time rather than react to
  // `event` updates — an eventRef keeps the interval reading fresh data
  // without needing to be torn down and recreated on every event change.
  const eventRef = useRef(event);
  eventRef.current = event;
  const toastedPendingCallIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const interval = setInterval(() => {
      const currentEvent = eventRef.current;
      if (!currentEvent) return;
      const alarmMs = getUnassignedCallSurgeSeconds(currentEvent) * 1000;
      const stillPendingIds = new Set(
        (currentEvent.calls || []).filter(c => c.status === 'Pending').map(c => c.id)
      );
      // Drop toasted ids for calls no longer Pending, so a call that goes
      // Pending again later (e.g. its only team is removed) can re-alarm.
      for (const id of toastedPendingCallIdsRef.current) {
        if (!stillPendingIds.has(id)) toastedPendingCallIdsRef.current.delete(id);
      }
      for (const call of currentEvent.calls || []) {
        if (call.status !== 'Pending') continue;
        if (toastedPendingCallIdsRef.current.has(call.id)) continue;
        const createdAt = call.log?.[0]?.timestamp;
        if (!createdAt || Date.now() - createdAt < alarmMs) continue;

        toastedPendingCallIdsRef.current.add(call.id);
        const minutes = Math.floor(alarmMs / 60000);
        const seconds = Math.round((alarmMs % 60000) / 1000);
        const durationLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
        toast.warning(
          <div>
            <div>{`${t('Call')} #${call.order}: ${t('Call pending')} ${durationLabel}`}</div>
            <div>{t('surge alert activated')}</div>
          </div>,
          {
            position: 'top-right',
            autoClose: 10000,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            transition: Slide,
          }
        );
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [t]);

  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const [openClinicCallId, setOpenClinicCallId] = useState<string | null>(null);
  const [, setTeamToAdd] = useState<{ [callId: string]: string }>({});
  // const [addMenuType, setAddMenuType] = useState<{ [callId: string]: 'main' | 'team' | 'supervisor' | 'equipment' }>({});
  const [showQuickCallForm, setShowQuickCallForm] = useState(false);
  const quickCallRef = useRef<HTMLFormElement>(null);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showEditTeamModal, setShowEditTeamModal] = useState(false);
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [quickCall, setQuickCall] = useState({
    location: '',
    source: '',
    age: '',
    gender: '',
    chiefComplaint: '',
    assignedTeam: '',
  });

  // Opens the Add Call modal fresh each time — resets any fields left over
  // from a previous open before applying prefill (a map pin/team marker
  // click prefills location or assignedTeam; a plain "Add Call" button
  // passes none).
  const openAddCallModal = (prefill?: Partial<typeof quickCall>) => {
    setQuickCall({
      location: '',
      source: '',
      age: '',
      gender: '',
      chiefComplaint: '',
      assignedTeam: '',
      ...prefill,
    });
    setShowQuickCallForm(true);
  };
  const [clinicCall, setClinicCall] = useState({
    age: '',
    gender: '',
    chiefComplaint: '',
  });
  const [teamName, setTeamName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberCert, setMemberCert] = useState('');
  const [editTeamOriginalName, setEditTeamOriginalName] = useState<string | null>(null);
  const { certifications: LICENSES } = useCertifications();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    callId: string;
  } | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedDuplicateCallId, setSelectedDuplicateCallId] = useState<string | null>(null);
  type EditableCallField = keyof Call | 'ageSex';

  const [editingCell, setEditingCell] = useState<{ callId: string; field: EditableCallField } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const [showResolvedClinicCalls, setShowResolvedClinicCalls] = useState(false);
  
  const [showAddSupervisorModal, setShowAddSupervisorModal] = useState(false);
  const [showEditSupervisorModal, setShowEditSupervisorModal] = useState(false);
  const [editSupervisorOriginalName, setEditSupervisorOriginalName] = useState<string | null>(null);
  const [showQuickClinicCallForm, setShowQuickClinicCallForm] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);

  const [showTransportUnitModal, setShowTransportUnitModal] = useState(false);
  const [transportUnitCallId, setTransportUnitCallId] = useState<string | null>(null);
  const [transportUnitValue, setTransportUnitValue] = useState('');

  // Call-side "Transferred to ambulance" (Rolled from Scene) unit-number
  // prompt — same modal component as the clinic one above, separate state
  // since it also needs to remember which team on the call is transferring.
  const [showCallTransportUnitModal, setShowCallTransportUnitModal] = useState(false);
  const [callTransportUnitCallId, setCallTransportUnitCallId] = useState<string | null>(null);
  const [callTransportUnitTeam, setCallTransportUnitTeam] = useState<string | null>(null);
  const [callTransportUnitValue, setCallTransportUnitValue] = useState('');

  const openCallTransportUnitModal = useCallback((callId: string, team: string) => {
    setCallTransportUnitCallId(callId);
    setCallTransportUnitTeam(team);
    setCallTransportUnitValue('');
    setShowCallTransportUnitModal(true);
  }, []);
  
  // Configure admin emails here or load from environment / Firestore for your deployment.
  const ADMIN_EMAILS: string[] = [];
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const isTimeSlotActive = (timeSlot: string, allTimes: string[]) => {
    const now = new Date();
    const currentHHMM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const sortedTimes = [...allTimes].sort();
    const index = sortedTimes.indexOf(timeSlot);
    if (index === -1) return false;
    
    const nextTime = sortedTimes[index + 1];
    return currentHHMM >= timeSlot && (!nextTime || currentHHMM < nextTime);
  };

  const updateEvent = useCallback(async (
    updateInput: Partial<Event> | ((current: Event) => Partial<Event>),
    options?: {
      bypassEndedCheck?: boolean;
      /** Units whose Location this write may change on a live-tracking event (a manual edit); see keepTrackedLocations. */
      locationEdits?: string[];
    }
  ) => {
    if (!eventId) return;

    if (isLiteMode) {
      try {
        const currentDraft = await getLiteEvent(eventId);
        if (!currentDraft) {
          throw new Error('Lite event not found');
        }

        const currentEvent = normalizeLiteDraftToEvent(currentDraft);

        if (!options?.bypassEndedCheck && isEventEnded(currentEvent)) {
          console.warn('Blocked update: event has ended.');
          return;
        }

        const updates = stampStatusSince(
          currentEvent,
          keepTrackedLocations(currentEvent, typeof updateInput === 'function' ? updateInput(currentEvent) : updateInput, options?.locationEdits)
        );

        const nextEvent = {
          ...currentEvent,
          ...removeUndefinedDeep(updates),
        } as Event;

        const nextDraft = toLiteDraftFromEvent(nextEvent, currentDraft);
        await saveLiteEvent(nextDraft);

        setEvent(nextEvent);
        setPostAssignments(nextEvent.postAssignments || {});
      } catch (error) {
        console.error('Local update failed:', error);
        toast.error('Failed to save local changes. Please try again.');
      }
      return;
    }

    try {
      await dbService.runTransaction(async (tx) => {
        const snap = await tx.get<Event>('events', eventId);
        if (!snap.exists || !snap.data) throw new Error("Event does not exist");

        const currentEvent = snap.data;

        if (!options?.bypassEndedCheck && isEventEnded(currentEvent)) {
          throw new Error('EVENT_ENDED');
        }

        let updates: Partial<Event>;
        if (typeof updateInput === 'function') {
          updates = updateInput(currentEvent);
        } else {
          updates = updateInput;
        }

        tx.update('events', eventId, removeUndefinedDeep(stampStatusSince(currentEvent, keepTrackedLocations(currentEvent, updates, options?.locationEdits))));
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'EVENT_ENDED') {
        console.warn('Blocked update: event has ended.');
        return;
      }
      console.error("Update failed:", error);
      toast.error("Failed to save changes. Please try again.");
    }
  }, [eventId, isLiteMode]);

  const handlePostAssignment = useCallback(async (time: string, post: string, team: string) => {
    await updateEvent((currentEvent) => {
      const assignments = { ...(currentEvent.postAssignments || {}) };
      if (!assignments[time]) assignments[time] = {};

      Object.keys(assignments[time]).forEach(p => {
        if (assignments[time][p] === team) {
          delete assignments[time][p];
        }
      });

      if (team) {
        assignments[time][post] = team;
      } else {
        delete assignments[time][post];
      }

      let updatedStaff = currentEvent.staff;
      const isActive = isTimeSlotActive(time, currentEvent.postingTimes || []);
      
      if (isActive && updatedStaff) {
        updatedStaff = updatedStaff.map(s => {
          if (s.team !== team) return s;

          const newHomeBase = post || 'Roaming';
          const shouldMoveLocation = s.status === 'Available';

          if (!shouldMoveLocation || newHomeBase === s.location) {
            return { ...s, originalPost: newHomeBase };
          }

          const now = new Date();
          const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
          return {
            ...s,
            originalPost: newHomeBase,
            location: newHomeBase,
            log: [...(s.log || []), { timestamp: now.getTime(), message: `${hhmm} - Post changed to ${newHomeBase}` }],
          };
        });
      }

      return {
        postAssignments: assignments,
        staff: updatedStaff
      };
    });
  }, [updateEvent]);

  const handleBulkPostAssignment = useCallback(async (newAssignments: PostAssignment) => {
    await updateEvent((currentEvent) => {
      const finalAssignments = { ...(currentEvent.postAssignments || {}), ...newAssignments };
      
      let updatedStaff = currentEvent.staff || [];
      const times = currentEvent.postingTimes || [];

      const activeTimeSlot = times.find(t => isTimeSlotActive(t, times));
      
      if (activeTimeSlot && newAssignments[activeTimeSlot]) {
        const activeAssignments = finalAssignments[activeTimeSlot];
        
        updatedStaff = updatedStaff.map(s => {
          const assignedPost = Object.keys(activeAssignments).find(
            key => activeAssignments[key] === s.team
          );

          const newHomeBase = assignedPost || 'Roaming';
          const shouldMoveLocation = s.status === 'Available';
          if (s.originalPost === newHomeBase) return s;

          if (!shouldMoveLocation || newHomeBase === s.location) {
            return { ...s, originalPost: newHomeBase };
          }

          const now = new Date();
          const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
          return {
            ...s,
            originalPost: newHomeBase,
            location: newHomeBase,
            log: [...(s.log || []), { timestamp: now.getTime(), message: `${hhmm} - Post changed to ${newHomeBase}` }],
          };
        });
      }

      return {
        postAssignments: finalAssignments,
        staff: updatedStaff
      };
    });
  }, [updateEvent]);

  const handleClearAllPostAssignments = useCallback(async () => {
    if (!confirm('Are you sure you want to clear all assignments?')) return;
    
    await updateEvent((currentEvent) => {
      const emptyAssignments: PostAssignment = {};
      
      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const updatedStaff = (currentEvent.staff || []).map(s => {
        if (s.status !== 'Available' || s.location === 'Roaming') {
          return { ...s, originalPost: 'Roaming' };
        }
        return {
          ...s,
          originalPost: 'Roaming',
          location: 'Roaming',
          log: [...(s.log || []), { timestamp: now.getTime(), message: `${hhmm} - Post changed to Roaming` }],
        };
      });

      return {
        postAssignments: emptyAssignments,
        staff: updatedStaff
      };
    });
  }, [updateEvent]);

  const handleUpdatePostingTime = useCallback(async (originalTime: string, newTime: string) => {
    if (originalTime === newTime) return;

    await updateEvent((currentEvent) => {
      const times = currentEvent.postingTimes || [];
      if (times.includes(newTime)) {
         throw new Error("Time slot already exists");
      }
      const newTimes = times.map(t => t === originalTime ? newTime : t);

      const assignments = { ...(currentEvent.postAssignments || {}) };
      if (assignments[originalTime]) {
        assignments[newTime] = assignments[originalTime];
        delete assignments[originalTime];
      }

      return {
        postingTimes: newTimes,
        postAssignments: assignments
      };
    });
  }, [updateEvent]);

  // --- Admin Action Handlers ---

  const handlePopulateTestData = useCallback(async () => {
    if (!event) return;
    const now = Date.now();
    const testTeams: Staff[] = [
      { id: newTeamId(), team: 'Alpha', members: ['Test User [EMT]'], status: 'Available', location: 'Roaming', log: [{ timestamp: now, message: 'Test data populated' }], originalPost: 'Roaming' },
      { id: newTeamId(), team: 'Bravo', members: ['Test User [Paramedic]'], status: 'Available', location: 'Roaming', log: [{ timestamp: now, message: 'Test data populated' }], originalPost: 'Roaming' },
      { id: newTeamId(), team: 'Charlie', members: ['Test User [RN]'], status: 'Available', location: 'Roaming', log: [{ timestamp: now, message: 'Test data populated' }], originalPost: 'Roaming' }
    ];
    
    const currentTeamNames = new Set((event.staff || []).map(s => s.team));
    const teamsToAdd = testTeams.filter(t => !currentTeamNames.has(t.team));
    
    if (teamsToAdd.length === 0) {
      toast.info("Test teams (Alpha, Bravo, Charlie) already exist.");
      return;
    }

    await updateEvent({ staff: [...(event.staff || []), ...teamsToAdd] });
    toast.success(`Added ${teamsToAdd.length} test teams.`);
  }, [event, updateEvent]);

  const handleResetAllStatuses = useCallback(async () => {
    if (!event) return;
    const now = Date.now();
    const hhmm = new Date().getHours().toString().padStart(2, '0') + new Date().getMinutes().toString().padStart(2, '0');
    
    const updatedStaff = (event.staff || []).map(s => ({
      ...s,
      status: 'Available',
      location: 'Roaming',
      log: [...(s.log || []), { timestamp: now, message: `${hhmm} - Admin Reset: Status set to Available` }]
    }));

    await updateEvent({ staff: updatedStaff });
    toast.success("All staff statuses reset to Available/Roaming.");
  }, [event, updateEvent]);

  const handleNuclearClear = useCallback(async () => {
    if (!event) return;
    if (!window.confirm("WARNING: This will delete ALL calls and reset ALL logs. Staff will be kept but history wiped. Continue?")) return;

    const now = Date.now();
    const updatedStaff = (event.staff || []).map(s => ({
      ...s,
      log: [{ timestamp: now, message: 'System logs cleared by Admin' }],
      status: 'Available',
      location: 'Roaming'
    }));
    
    const updatedSupervisors = (event.supervisor || []).map(s => ({
        ...s,
        log: [{ timestamp: now, message: 'System logs cleared by Admin' }],
        status: 'Available',
        location: 'Roaming'
    }));

    await updateEvent({
      calls: [],
      staff: updatedStaff,
      supervisor: updatedSupervisors
    });
    toast.error("System Nuke Executed: All calls deleted and logs reset.");
  }, [event, updateEvent]);

  function isDuplicateTeamName(teamName: string, existingStaff: Staff[]): boolean {
    if (!teamName || !existingStaff || existingStaff.length === 0) return false;
    
    const normalizedName = teamName.toLowerCase().trim();
    
    console.log('Checking for duplicate team name:', normalizedName);
    console.log('Existing teams:', existingStaff.map(s => s.team.toLowerCase().trim()));
    
    return existingStaff.some(staff => {
      const existingName = staff.team.toLowerCase().trim();
      const isDuplicate = existingName === normalizedName;
      if (isDuplicate) {
        console.log(`Found duplicate: "${existingName}" matches "${normalizedName}"`);
      }
      return isDuplicate;
    });
  }

  const handleAddNewTeam = useCallback(() => {
    setShowAddTeamModal(true);
  }, []);

  const handleAddNewSupervisor = useCallback(() => {
    // Reset only what the 3-field supervisor form needs
    setTeamName('');        // Call Sign
    setMemberName('');      // Supervisor Name (optional)
    setMemberCert('');      // Certification (required)
    setShowAddSupervisorModal(true);
  }, []);

  const handleAddNewEquipment = useCallback(() => {
    setShowAddEquipmentModal(true);
  }, []);



  const handleSaveNewSupervisor = useCallback(async () => {
    if (!event) return;

    const callSign = teamName.trim();
    const cert = memberCert.trim();
    // name is optional
    const name = memberName.trim();

    if (!callSign || !cert) {
      alert('Supervisor Call Sign and Certification are required.');
      return;
    }

    // Prevent duplicate call signs
    if (event.supervisor?.some(s => s.team.toLowerCase().trim() === callSign.toLowerCase())) {
      alert(`A supervisor with the call sign "${callSign}" already exists.`);
      return;
    }

    // Build the single-line member string (name may be empty)
    const memberString = `${name || 'Supervisor'} [${cert}]`;

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    const newSupervisor: Supervisor = {
      id: newTeamId(),
      team: callSign,
      member: memberString,
      status: 'Available',
      location: 'Roaming',
      log: [{ timestamp: now.getTime(), message: `${hhmm} - supervisor created` }],
      originalPost: 'Roaming',
    };

    try {
      await updateEvent({
        supervisor: [...(event.supervisor || []), newSupervisor],
      });

      // clear fields + close
      setTeamName('');
      setMemberName('');
      setMemberCert('');
      setShowAddSupervisorModal(false);
    } catch (error) {
      console.error('Error saving supervisor:', error);
      alert('Error saving supervisor. Please try again.');
    }
  }, [event, teamName, memberName, memberCert, updateEvent]);

  const handleEditSupervisor = useCallback((supervisor: Supervisor) => {
    setTeamName(supervisor.team);

    // Parse "Name [CERT]" into fields
    const match = supervisor.member?.match(/^(.+?)\s\[(.+?)\]$/);
    const name = match ? match[1].trim() : (supervisor.member || '').trim();
    const cert = match ? match[2].trim() : '';

    setMemberName(name);     // optional
    setMemberCert(cert);     // required

    // keep team fields for teams untouched
    setEditSupervisorOriginalName(supervisor.team);
    setShowEditSupervisorModal(true);
  }, []);

  const handleSaveEditedSupervisor = useCallback(async () => {
    if (!event || !editSupervisorOriginalName) return;

    const newCallSign = teamName.trim();
    const cert = memberCert.trim();
    const name = memberName.trim(); // optional

    if (!newCallSign || !cert) {
      alert('Supervisor Call Sign and Certification are required.');
      return;
    }

    // if call sign changed, prevent duplicates
    if (
      editSupervisorOriginalName !== newCallSign &&
      event.supervisor?.some(s => s.team.toLowerCase().trim() === newCallSign.toLowerCase())
    ) {
      alert(`A supervisor with the call sign "${newCallSign}" already exists.`);
      return;
    }

    const memberString = `${name || 'Supervisor'} [${cert}]`;

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    const updatedSupervisor = (event.supervisor || []).map(s => {
      if (s.team !== editSupervisorOriginalName) return s;
      return {
        ...s,
        team: newCallSign,
        member: memberString,
        log: [
          ...(s.log || []),
          {
            timestamp: now.getTime(),
            message: `${hhmm} - supervisor edited${
              editSupervisorOriginalName !== newCallSign ? ` (renamed from ${editSupervisorOriginalName})` : ''
            }`,
          },
        ],
      };
    });

    try {
      await updateEvent({ supervisor: updatedSupervisor });

      setTeamName('');
      setMemberName('');
      setMemberCert('');
      setEditSupervisorOriginalName(null);
      setShowEditSupervisorModal(false);
    } catch (error) {
      console.error('Error saving supervisor changes:', error);
      alert('Error saving supervisor changes. Please try again.');
    }
  }, [event, teamName, memberName, memberCert, editSupervisorOriginalName, updateEvent]);


  const handleDeleteSupervisor = useCallback(async (supervisorNameToDelete: string) => {
    if (!event) return;

    const remainingSupervisor = (event.supervisor || []).filter(s => s.team !== supervisorNameToDelete);

    await updateEvent({
      supervisor: remainingSupervisor
    });
  }, [event, updateEvent]);

  const handleSaveNewTeam = useCallback(async (team: TeamDraft) => {
    const trimmedName = team.name;

    // Pass a function to updateEvent to get the LATEST 'event' from server
    await updateEvent((currentEvent) => {
      // Check for duplicates using the FRESH currentEvent
      if (isDuplicateTeamName(trimmedName, currentEvent.staff || [])) {
        throw new Error(`A team with the name "${trimmedName}" already exists.`);
        // Note: Throwing here cancels the transaction
      }

      const membersStrings = team.members.map(m => `${m.name} [${m.cert}]${m.lead ? ' (Lead)' : ''}`);

      const staffEntry: Staff = {
        id: newTeamId(),
        team: trimmedName,
        members: membersStrings,
        status: 'Available',
        location: '',
        log: [{ timestamp: Date.now(), message: 'Team created' }]
      };

      return { staff: [...(currentEvent.staff || []), staffEntry] };
    });
  }, [updateEvent]);

  const handleEditTeam = useCallback((staff: Staff) => {
    setEditTeamOriginalName(staff.team);
    setShowEditTeamModal(true);
  }, []);

  const editingTeam = useMemo<TeamDraft | undefined>(() => {
    if (!editTeamOriginalName || !event) return undefined;
    const staff = (event.staff || []).find(s => s.team === editTeamOriginalName);
    if (!staff) return undefined;
    const members = (staff.members || []).map((m) => {
      const lead = m.includes('(Lead)');
      const nameCertMatch = m.match(/^(.+?)\s\[(.+?)\]/);
      const name = nameCertMatch ? nameCertMatch[1].trim() : m.trim();
      const cert = nameCertMatch ? nameCertMatch[2].trim() : '';
      return { name, cert, lead };
    });
    return { name: staff.team, members };
  }, [editTeamOriginalName, event]);

  const allTeamNames = useMemo(
    () => (event?.staff || []).map(s => s.team),
    [event]
  );
  const teamNamesExcludingEdited = useMemo(
    () => (event?.staff || []).filter(s => s.team !== editTeamOriginalName).map(s => s.team),
    [event, editTeamOriginalName]
  );

  const handleSaveEditedTeam = useCallback(async (team: TeamDraft) => {
    if (!event || !editTeamOriginalName) return;

    const newName = team.name;
    const oldName = editTeamOriginalName;

    if (oldName !== newName && isDuplicateTeamName(newName, event.staff || [])) {
      alert(`A team with the name "${newName}" already exists. Please choose a different name.`);
      throw new Error(`A team with the name "${newName}" already exists.`);
    }

    const membersStrings = team.members.map(m => `${m.name} [${m.cert}]${m.lead ? ' (Lead)' : ''}`);

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    const updatedStaff = (event.staff || []).map(s => {
      if (s.team !== oldName) return s;
      return {
        ...s,
        team: newName,
        members: membersStrings,
        log: [
          ...(s.log || []),
          { timestamp: now.getTime(), message: `${hhmm} - team edited${oldName !== newName ? ` (renamed from ${oldName})` : ''}` }
        ]
      };
    });

    const updatedCalls = oldName !== newName ? (event.calls || []).map(c => {
      let assignedTeam = c.assignedTeam || [];
      let detachedTeams = c.detachedTeams || [];

      if (assignedTeam.includes(oldName)) {
        assignedTeam = assignedTeam.map(t => (t === oldName ? newName : t));
      }
      if (detachedTeams.length) {
        detachedTeams = detachedTeams.map(dt => dt.team === oldName ? { ...dt, team: newName } : dt);
      }

      return (assignedTeam !== c.assignedTeam || detachedTeams !== c.detachedTeams)
        ? { ...c, assignedTeam, detachedTeams }
        : c;
    }) : event.calls;

    try {
      await updateEvent({ staff: updatedStaff, calls: updatedCalls });
      setEditTeamOriginalName(null);
    } catch (error) {
      console.error('Error saving team changes:', error);
      alert('Error saving team changes. Please try again.');
      throw error;
    }
  }, [event, editTeamOriginalName, updateEvent]);

  const handleDeleteTeam = useCallback(async (teamNameToDelete: string) => {
    if (!event) return;

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    const remainingStaff = (event.staff || []).filter(s => s.team !== teamNameToDelete);

    const updatedCalls = (event.calls || []).map(c => {
      if (!c.assignedTeam?.includes(teamNameToDelete)) return c;

      const newAssigned = (c.assignedTeam || []).filter(t => t !== teamNameToDelete);
      const newStatus =
        newAssigned.length === 0
          ? 'Pending'
          : c.status;

      const log: CallLogEntry = {
        timestamp: now.getTime(),
        message: `${hhmm} - ${teamNameToDelete} removed (team deleted).`
      };

      return {
        ...c,
        assignedTeam: newAssigned,
        status: newStatus,
        log: [...(c.log || []), log]
      };
    });

    await updateEvent({
      staff: remainingStaff,
      calls: updatedCalls
    });
  }, [event, updateEvent]);

  const [teamStatusMap, setTeamStatusMap] = useState<{ [callId: string]: { [team: string]: string } }>({});

  const getCallRowClass = (call: Call) => {
    if (!Array.isArray(call.assignedTeam)) return '';

    if (!event) return '';

    const statuses = call.assignedTeam
      .map(t => event?.staff.find(s => s.team === t)?.status)
      .filter((status): status is string => status !== undefined);

    return getRowStatusClass(statuses);
  };


  async function handleAgeSexBlur(callId: string) {
    const call = event?.calls.find(c => c.id === callId);
    if (!call) return;

    const { age, gender } = parseAgeSex(editValue);
    const newAge = age || '';
    const newGender = gender || '';

    const hasChange = (call.age || '') !== newAge || (call.gender || '') !== newGender;
    if (hasChange) {
      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const updatedCall = {
        ...call,
        age: newAge,
        gender: newGender,
        log: [...(call.log || []), { timestamp: now.getTime(), message: `${hhmm} - Age/Sex set to ${formatAgeSex(newAge, newGender) || 'N/A'}.` }]
      };
      const updated = event!.calls.map(c => c.id === callId ? updatedCall : c);
      await updateEvent({ calls: updated });
    }
    setEditingCell(null);
  }


  const handleSupervisorStatusChange = useCallback((supervisor: Staff, newStatus: string) => {
    // "at <location>" gives the log entry real context (which call this
    // status change belongs to) without needing a separate call reference.
    const activeCall = event?.calls?.find(c =>
      c.assignedTeam?.includes(supervisor.team) && !['Resolved', 'Available'].includes(c.status)
    );
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
    const logMessage = `${hhmm} - status changed to ${newStatus}${activeCall ? ` at ${activeCall.location}` : ''}`;

    const updatedSupervisors = event?.supervisor.map(s =>
      s.team === supervisor.team
        ? {
            ...s,
            status: newStatus,
            log: [
              ...(s.log || []),
              { timestamp: now.getTime(), message: logMessage }
            ]
          }
        : s
    );
    // updateEvent({ supervisor: updatedSupervisors });
    updateEvent({ 
      supervisor: updatedSupervisors,
      postAssignments
    });
  }, [event, updateEvent, postAssignments]);

  const handleSupervisorLocationChange = useCallback(async (supervisor: Staff, newLocation: string) => {
    // On a live-tracking event Location is where the unit is, never its post, and never sets a status (D66).
    const tracked = event?.mapMode === 'tak';
    const updatedSupervisors = event?.supervisor.map(s =>
      s.team === supervisor.team
        ? {
            ...s,
            location: newLocation,
            status: !tracked && newLocation === 'Clinic' && s.status === 'Available' ? 'In Clinic' : s.status, // Changed from 'Available'
            log: [
              ...(s.log || []),
              {
                timestamp: Date.now(),
                message: `${new Date().getHours().toString().padStart(2, '0')}${new Date().getMinutes().toString().padStart(2, '0')} - ${tracked ? 'Location' : 'Post'} changed to ${newLocation}`
              }
            ]
          }
        : s
    );
    // await updateEvent({ supervisor: updatedSupervisors });
    await updateEvent({ 
      supervisor: updatedSupervisors,
      postAssignments
    }, { locationEdits: [supervisor.team] });
  }, [event, updateEvent, postAssignments]);

  // Helper to convert equipment data to EquipmentItem format
  const getEquipmentItems = (): EquipmentItem[] => {
    if (!event) return [];
    const items: EquipmentItem[] = [];
    
    // If eventEquipment exists and has items, use ONLY that (deleted items won't be in the array)
    // Otherwise fall back to venue equipment
    const equipmentSource = (event.eventEquipment && event.eventEquipment.length > 0) 
      ? event.eventEquipment 
      : (event?.venue?.equipment || []);
    
    equipmentSource.forEach(eq => {
      const eqName = typeof eq === 'string' ? eq : eq.name;
      const eventEq = event.eventEquipment?.find(e => e.name === eqName);
      
      // Get staging location - prefer eventEquipment's defaultLocation, fallback to equipment location from venue
      const stagingLocation = eventEq?.defaultLocation || 
                             (typeof eq !== 'string' && eq.location) || 
                             'Staging';
      
      // Check if equipment is on any active call
      const activeCall = event.calls?.find(c => 
        c.equipment?.includes(eqName) && 
        !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release'].includes(c.status)
      );
      
      // Determine delivery team
      const deliveryTeam = activeCall?.equipmentTeams?.[0];
      
      // Determine current location - prefer eventEquipment location if set
      let currentLocation = eventEq?.location;
      
      // If on call and delivered eq, location is the assigned team
      if (activeCall && activeCall.status === 'Delivered Eq') {
        currentLocation = activeCall.assignedTeam[0];
      }
      
      // Check if equipment is in clinic
      const inClinic = currentLocation === 'In Clinic' || eventEq?.status === 'In Clinic';
      
      // Determine status
      let status: string;
      if (activeCall) {
        // Get the call display number for this call
        const callNum = callDisplayNumberMap.get(activeCall.id) || activeCall.order;
        status = `Call ${callNum}`;
      } else if (inClinic) {
        status = 'In Clinic';
      } else {
        status = eventEq?.status || 'Available';
      }
      
      items.push({
        name: eqName,
        stagingLocation: stagingLocation,
        currentLocation: currentLocation || stagingLocation,
        status: status,
        callId: activeCall?.id,
        deliveryTeam: deliveryTeam,
        needsRefresh: inClinic && !activeCall, // Only needs refresh if in clinic but not on active call
        notes: eventEq?.notes,
      });
    });
    
    return items;
  };

  const handleEquipmentStatusChange = useCallback(async (equipmentName: string, newStatus: string) => {
    if (!event) return;
    
    try {
      const existing = (event.eventEquipment || []).find(eq => eq.name === equipmentName);

      let updatedEventEquipment: EventEquipment[] = event.eventEquipment ? [...event.eventEquipment] : [];

      if (existing) {
        updatedEventEquipment = updatedEventEquipment.map(eq =>
          eq.name === equipmentName ? { ...eq, status: newStatus as EquipmentStatus } : eq
        );
      } else {
        // Not currently tracked in event.eventEquipment — add it so changes persist
        // Try to derive a staging/location from venue definition if available
        const venueEq = (event.venue?.equipment || []).find(v => (typeof v === 'string' ? v : v.name) === equipmentName);
        const derivedLocation = typeof venueEq === 'string' ? '' : (venueEq && (venueEq as { location?: string }).location) || '';
        const newItem: EventEquipment = {
          id: `eq_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          name: equipmentName,
          status: newStatus as EquipmentStatus,
          location: derivedLocation,
          assignedTeam: null,
        } as EventEquipment;
        updatedEventEquipment.push(newItem);
      }

      // Optimistically update local state so the UI reflects the change immediately
      setEvent(prev => prev ? { ...prev, eventEquipment: updatedEventEquipment } : prev);

      await updateEvent({ eventEquipment: updatedEventEquipment });
    } catch (error) {
      console.error('Error updating equipment status:', error);
      toast.error('Failed to update equipment status');
    }
  }, [event, updateEvent, setEvent]);

  const handleEquipmentLocationChange = (equipmentName: string, newLocation: string) => {
    if (!event) return;
    const existing = event.eventEquipment?.find(e => e.name === equipmentName);
    const updatedEquipment = existing 
      ? (event.eventEquipment || []).map(e => e.name === equipmentName ? { ...e, location: newLocation } : e)
      : [...(event.eventEquipment || []), { 
          id: `eq_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          name: equipmentName,
          status: 'Available' as EquipmentStatus,
          location: newLocation,
          assignedTeam: null,
        }];
    updateEvent({ eventEquipment: updatedEquipment });
  };

  const handleEquipmentMarkReady = (equipmentName: string) => {
    // Mark equipment as ready: reset to staging location
    if (!event) return;
    const eqItem = event.venue?.equipment?.find(e => (typeof e === 'string' ? e : e.name) === equipmentName);
    const stagingLocation = typeof eqItem === 'string' ? '' : eqItem?.location || 'Not Set';
    const updatedEquipment = (event.eventEquipment || []).map(e => 
      e.name === equipmentName ? { ...e, location: stagingLocation } : e
    );
    updateEvent({ eventEquipment: updatedEquipment });
  };

  const handleEquipmentDelete = useCallback(async (equipmentName: string) => {
    if (!event) return;
    
    const confirmDelete = window.confirm(`Delete equipment "${equipmentName}" from this event?`);
    if (!confirmDelete) return;

    try {
      // Remove from eventEquipment array (event-specific equipment)
      const updatedEventEquipment = (event.eventEquipment || []).filter(
        eq => eq.name !== equipmentName
      );

      await updateEvent({
        eventEquipment: updatedEventEquipment
      });

      toast.success(`Deleted equipment: ${equipmentName}`);
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast.error('Failed to delete equipment');
    }
  }, [event, updateEvent]);

  const handleResetEquipmentLocations = useCallback(async () => {
    if (!event) return;
    
    const updatedEventEquipment = (event.eventEquipment || []).map(eq => {
      // Get the default/staging location from venue equipment definition
      const venueEq = (event.venue?.equipment || []).find(v => 
        (typeof v === 'string' ? v : v.name) === eq.name
      );
      const defaultLocation = typeof venueEq === 'string' ? 'Staging' : (venueEq?.location || 'Staging');
      
      return {
        ...eq,
        location: eq.defaultLocation || defaultLocation,
        status: 'Available' as EquipmentStatus
      };
    });

    await updateEvent({ eventEquipment: updatedEventEquipment });
    toast.success('Equipment locations reset to defaults');
  }, [event, updateEvent]);

  // getEquipmentItems() (above) only renders event.eventEquipment once it has
  // any items at all — otherwise it falls back to showing the venue's raw
  // catalog. Appending straight onto an empty eventEquipment array would flip
  // that fallback off and make every other venue equipment card vanish, so
  // any add-equipment path materializes the venue catalog into eventEquipment
  // first (a no-op once it's already populated).
  const materializeEventEquipment = useCallback((currentEvent: Event): EventEquipment[] => {
    if (currentEvent.eventEquipment && currentEvent.eventEquipment.length > 0) {
      return currentEvent.eventEquipment;
    }
    return (currentEvent.venue?.equipment || []).map(v => {
      const name = typeof v === 'string' ? v : v.name;
      const location = typeof v === 'string' ? 'Staging' : (v.location || 'Staging');
      return {
        id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        status: 'Available' as EquipmentStatus,
        location,
        defaultLocation: location,
        assignedTeam: null,
      };
    });
  }, []);

  const handleAddVenueEquipment = useCallback(async (equipmentName: string) => {
    if (!event) return;

    // Find the venue equipment definition
    const venueEq = (event.venue?.equipment || []).find(v =>
      (typeof v === 'string' ? v : v.name) === equipmentName
    );

    if (!venueEq) return;

    const name = typeof venueEq === 'string' ? venueEq : venueEq.name;
    const defaultLocation = typeof venueEq === 'string' ? 'Staging' : (venueEq.location || 'Staging');

    const newEquipment: EventEquipment = {
      id: `eq_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      name: name,
      status: 'Available' as EquipmentStatus,
      location: defaultLocation,
      defaultLocation: defaultLocation,
      assignedTeam: null,
    };

    await updateEvent({
      eventEquipment: [...materializeEventEquipment(event), newEquipment]
    });

    toast.success(`Added equipment: ${name}`);
  }, [event, updateEvent, materializeEventEquipment]);

  // Adds a one-off item that exists only for this event (not part of the
  // venue's equipment catalog) — e.g. a piece of gear borrowed just for
  // today. Opened via the "+" dropdown's "Add Equipment" option.
  const handleAddTemporaryEquipment = useCallback(async (name: string, location?: string) => {
    if (!event) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const startLocation = location?.trim() || 'Staging';

    const newEquipment: EventEquipment = {
      id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      status: 'Available' as EquipmentStatus,
      location: startLocation,
      defaultLocation: startLocation,
      assignedTeam: null,
      notes: 'Temporary — added for this event only',
    };

    await updateEvent({
      eventEquipment: [...materializeEventEquipment(event), newEquipment]
    });

    toast.success(`Added equipment: ${trimmedName}`);
  }, [event, updateEvent, materializeEventEquipment]);

  // Get venue equipment that's not yet on the dispatch page
  const getAvailableVenueEquipment = useCallback(() => {
    if (!event?.venue?.equipment) return [];
    
    const currentEquipmentNames = new Set(
      (event.eventEquipment || []).map(eq => eq.name)
    );
    
    return (event.venue.equipment || [])
      .map(eq => typeof eq === 'string' ? eq : eq.name)
      .filter(name => !currentEquipmentNames.has(name));
  }, [event]);


  // Statuses that fully resolve a call — per any one of these on any one team,
  // the whole call closes out and every other team/supervisor/equipment still
  // on it releases back to post, not just the team that reported it.
  const RESOLVING_STATUSES = ['Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Unable to Locate', 'Rolled from Scene'];

  const handleTeamStatusChange = (callId: string, team: string, newStatus: string, clinicId?: string, transportUnitValue?: string) => {
    console.log("FUNCTION CALLED", { callId, team, newStatus });
    setTeamStatusMap(prev => {
      const updatedStatusMap = { ...prev };
      if ([...RESOLVING_STATUSES, 'Detached', 'Delivering', 'Delivered Eq'].includes(newStatus)) {
        // Remove team's status from this call in teamStatusMap when detaching
        if (updatedStatusMap[callId]) {
          delete updatedStatusMap[callId][team];
        }
      } else {
        // Normal update for non-detaching statuses
        updatedStatusMap[callId] = {
          ...(updatedStatusMap[callId] || {}),
          [team]: newStatus
        };
      }
      return updatedStatusMap;
    });

    const latestCall = event?.calls.find(c => c.id === callId);
    if (!latestCall) return;

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
    const resolvedClinicId = clinicId ?? latestCall.clinicId ?? (event?.clinics?.[0]?.id || 'clinic');
    const destinationClinicName = ['Transporting', 'Delivered'].includes(newStatus)
      ? getClinicName(clinics, resolvedClinicId)
      : undefined;
    let logMessage: string;
    if (newStatus === 'Transporting') {
      logMessage = `${hhmm} - ${team} transporting to ${destinationClinicName || 'clinic'}`;
    } else if (newStatus === 'Rolled from Scene') {
      logMessage = `${hhmm} - ${team} Transferred to ambulance${transportUnitValue ? `, unit #: ${transportUnitValue}` : ''}`;
    } else if (newStatus === 'Delivered Eq' || newStatus === 'En Route Eq') {
      // Names the actual equipment item(s) instead of the generic "Eq"
      // suffix shown in the pill/dropdown (see equipmenttypeicon.tsx).
      const equipmentNames = (event?.eventEquipment || [])
        .filter(eq => eq.assignedTeam === team)
        .map(eq => eq.name)
        .join(', ');
      const verb = newStatus === 'Delivered Eq' ? 'Delivered' : 'En Route';
      logMessage = `${hhmm} - ${team} ${verb}${equipmentNames ? ` ${equipmentNames}` : ''}`;
    } else {
      // "at <location>" gives the log entry real context (which call this
      // status change belongs to) without needing a separate call reference.
      logMessage = `${hhmm} - ${team} set to ${newStatus} at ${latestCall.location}${destinationClinicName ? ` (${destinationClinicName})` : ''}`;
    }

    // DECLARE newCallStatus here with proper initialization
    let newCallStatus = latestCall.status; // Initialize with current status

    // Every other team still on the call when a resolving status closes it
    // out — used below to release them (staff/supervisor/equipment) along
    // with the acting team, instead of leaving them assigned indefinitely.
    const otherAssignedTeams = RESOLVING_STATUSES.includes(newStatus)
      ? (latestCall.assignedTeam || []).filter(tm => tm !== team)
      : [];

    const isEqDetaching = ['Delivered Eq'].includes(newStatus);
    // Status the team held immediately before this change, captured here (before teamStatusMap
    // is overwritten above) so a later revert can restore it.
    const priorTeamStatus = teamStatusMap[callId]?.[team];
    const priorTeamLocation = event?.staff.find(s => s.team === team)?.location;

    const updatedCalls = (event?.calls || []).map(c => {
      console.log('call updated');
      if (c.id !== callId) return c;

      const isResolvingCascade = RESOLVING_STATUSES.includes(newStatus);
      const isDetaching = isResolvingCascade || ['Detached', 'Delivering'].includes(newStatus);

      const updatedLog = [...(c.log || []), { timestamp: Date.now(), message: logMessage }];

      let updatedAssignedTeam = c.assignedTeam || [];
      let updatedEquipmentTeams = c.equipmentTeams || [];
      const updatedDetachedTeams = [...(c.detachedTeams || [])];

      // Handle equipment team detachment
      if (isEqDetaching) {
        updatedAssignedTeam = updatedAssignedTeam.filter(t => t !== team);
        updatedEquipmentTeams = updatedEquipmentTeams.filter(t => t !== team);
        
        // Record detachment
        if (!updatedDetachedTeams.some(t => t.team === team)) {
          const equipmentNames = (event?.eventEquipment || [])
            .filter(eq => eq.assignedTeam === team)
            .map(eq => eq.name);
          updatedDetachedTeams.push({
            team,
            reason: newStatus === 'Delivered Eq' ? 'Delivered Eq' : 'Detached',
            kind: 'equipment',
            previousStatus: priorTeamStatus || 'En Route Eq',
            previousLocation: priorTeamLocation,
            equipmentNames,
          });
        }
      } else if (isDetaching) {
        // Original detachment logic for regular teams
        // remove team from assigned list — a resolving cascade clears every
        // team on the call at once, not just the one that reported it
        updatedAssignedTeam = isResolvingCascade ? [] : updatedAssignedTeam.filter(t => t !== team);
        // Also remove from equipment teams if present
        updatedEquipmentTeams = isResolvingCascade ? [] : updatedEquipmentTeams.filter(t => t !== team);

        // record one-time detachment for the acting team
        if (!updatedDetachedTeams.some(t => t.team === team)) {
          updatedDetachedTeams.push({
            team,
            reason: newStatus,
            kind: 'team',
            previousStatus: priorTeamStatus || 'En Route',
            previousLocation: priorTeamLocation,
          });
        }

        // Auto-detach every other team still on the call once it resolves —
        // delivered/refusal/nmm/unable-to-locate/transferred-to-ambulance all
        // close the call out for everyone on it, not just the reporting team.
        if (isResolvingCascade) {
          otherAssignedTeams.forEach(otherTeam => {
            if (updatedDetachedTeams.some(t => t.team === otherTeam)) return;
            const otherStaff = event?.staff.find(s => s.team === otherTeam);
            updatedDetachedTeams.push({
              team: otherTeam,
              reason: 'Auto-detached',
              kind: c.equipmentTeams?.includes(otherTeam) ? 'equipment' : 'team',
              previousStatus: otherStaff?.status,
              previousLocation: otherStaff?.location,
            });
          });

          // Auto-detach supervisors on the call too
          const supervisorsOnCall = event?.supervisor?.filter(s =>
            c.assignedTeam?.includes(s.team)
          ) || [];

          supervisorsOnCall.forEach(supervisor => {
            if (!updatedDetachedTeams.some(t => t.team === supervisor.team)) {
              updatedDetachedTeams.push({
                team: supervisor.team,
                reason: 'Auto-detached',
                kind: 'supervisor',
                previousStatus: supervisor.status,
                previousLocation: supervisor.location,
              });
            }
          });

          // Remove supervisors from assigned teams (moot now assignedTeam is
          // already cleared above, kept for the non-resolving Detached path)
          updatedAssignedTeam = updatedAssignedTeam.filter(teamName =>
            !event?.supervisor?.some(s => s.team === teamName)
          );
        }

        if (updatedAssignedTeam.length === 0) {
          if (newStatus === 'Delivered') {
            newCallStatus = 'Delivered';
          } else if (newStatus === 'NMM') {
            newCallStatus = 'NMM';
          } else if (newStatus === 'Treat and Release') {
            newCallStatus = 'Treat and Release';
          } else if (newStatus === 'Unable to Locate') {
            newCallStatus = 'Unable to Locate';
          } else if (newStatus === 'Refusal') {
            newCallStatus = 'Refusal';
          } else if (newStatus === 'Ambulance') {
            newCallStatus = 'Resolved';
          } else {
            newCallStatus = 'Resolved';
          }
        } else {
          // compute composite status from remaining assigned teams
          const remainingStatuses = Object.entries(teamStatusMap[callId] || {})
            .filter(([teamName]) => updatedAssignedTeam.includes(teamName))
            .map(([, status]) => status as string);

          if (remainingStatuses.includes('Transporting')) newCallStatus = 'Transporting';
          else if (remainingStatuses.includes('On Scene')) newCallStatus = 'On Scene';
          else if (remainingStatuses.includes('En Route')) newCallStatus = 'En Route';
        }
      } else {
        // standard transitions while still assigned
        if (newStatus === 'On Scene') newCallStatus = 'On Scene';
        else if (newStatus === 'Transporting') newCallStatus = 'Transporting';
        else if (newStatus === 'Pending Transport') newCallStatus = 'Pending Transport';
      }

      // IMPORTANT: set clinic flag here (no second pass / no self-reference)
      const clinicFlag = (newStatus === 'Delivered' || newCallStatus === 'Delivered') ? true : (c.clinic ?? false);

      // Special handling for Ambulance status - show as "Rolled" but mark as resolved
      const displayStatus = newCallStatus === 'Resolved' && newStatus === 'Ambulance' ? 'Rolled' : newCallStatus;

      console.log(`[Status Change] Call ${callId} - Team: ${team} -> ${newStatus}`);
      console.log("Updated Arrays:", {
        assignedTeam: updatedAssignedTeam,
        equipmentTeams: updatedEquipmentTeams
      });

      return {
        ...c,
        status: displayStatus,
        clinic: clinicFlag,
        clinicId: resolvedClinicId,
        log: updatedLog,
        assignedTeam: updatedAssignedTeam,
        equipmentTeams: updatedEquipmentTeams,
        detachedTeams: updatedDetachedTeams,
        // Pin only matters while a call is active — once it resolves, drop it
        // so it doesn't carry over if the call is ever re-opened as a fresh pin.
        pin: RESOLVED_CALL_STATUSES.includes(displayStatus) ? false : c.pin,
        ...(newStatus === 'Rolled from Scene' && transportUnitValue ? { transportUnit: transportUnitValue } : {}),
      };
    });

    // Rest of the function continues as before...
    const updatedStaff = event?.staff.map(t => {
      if (t.team === team) {
        let updatedLocation = t.location;
        let updatedStatus = newStatus;

        // Handle equipment detachment statuses
        if (['Delivered Eq', 'Detached'].includes(newStatus)) {
          updatedLocation = t.originalPost || 'Unknown';
          updatedStatus = 'Available';
        } else if (newStatus === 'Delivered') {
          updatedLocation = 'Clinic';
          updatedStatus = 'In Clinic';
        } else if (['En Route', 'On Scene', 'Transporting', 'Pending Transport'].includes(newStatus)) {
          updatedLocation = latestCall.location;
          updatedStatus = newStatus;
        } else if (['En Route Eq', 'Assisting'].includes(newStatus)) {
          // Equipment assistance statuses
          updatedLocation = latestCall.location;
          updatedStatus = newStatus;
        } else if (['Refusal', 'NMM', 'Treat and Release', 'Detached', 'Unable to Locate', 'Rolled from Scene'].includes(newStatus)) {
          updatedLocation = t.originalPost || 'Unknown';
          updatedStatus = 'Available';
        } else if (newStatus === 'In Clinic') {
          updatedLocation = 'Clinic';
          updatedStatus = 'In Clinic';
        }

        return {
          ...t,
          status: updatedStatus,
          location: updatedLocation,
        };
      }

      // Auto-return every other team on the call once it resolves via any
      // one team — they weren't the one who reported the resolution, but
      // the call is closed for everyone on it now.
      if (otherAssignedTeams.includes(t.team)) {
        return {
          ...t,
          status: 'Available',
          location: t.originalPost || 'Unknown',
          log: [...(t.log || []), {
            timestamp: now.getTime(),
            message: `${hhmm} - auto-detached from completed call, status set to Available at ${t.originalPost || 'Unknown'}`
          }],
        };
      }

      return t;
    });

    // Handle supervisor status updates when call is complete
    let updatedSupervisor = event?.supervisor;
    if (RESOLVING_STATUSES.includes(newStatus)) {
      const supervisorsOnCall = event?.supervisor?.filter(s =>
        latestCall.assignedTeam?.includes(s.team)
      ) || [];

      if (supervisorsOnCall.length > 0) {
        updatedSupervisor = event?.supervisor?.map(s => {
          if (supervisorsOnCall.some(supervisor => supervisor.team === s.team)) {
            const teamLogEntry: TeamLogEntry = {
              timestamp: now.getTime(),
              message: `${hhmm} - auto-detached from completed call, status set to Available at Roaming`
            };
            
            return {
              ...s,
              status: 'Available',
              location: 'Roaming',
              log: [...(s.log || []), teamLogEntry]
            };
          }
          return s;
        });
      }
    }

    // Handle equipment status updates when call / team status changes
    let updatedEquipment = event?.eventEquipment;

    // Determine the call after updates and equipment listed on that call
    const callAfterUpdate = (updatedCalls || event?.calls || []).find(c => c.id === callId);
    const callEquipmentNames = new Set(
      (callAfterUpdate?.equipment || []).map((n: unknown) => (typeof n === 'string' ? n : (n as { name?: string }).name || ''))
    );

    // The acting team plus every other team the resolving cascade above just
    // released — equipment held by any of them needs to come back too.
    const resolvingTeams = [team, ...otherAssignedTeams];

    // Equipment currently held by the team(s) that just changed status OR listed on the call
    const teamEquipment = (event?.eventEquipment || []).filter(eq => resolvingTeams.includes(eq.assignedTeam || '') || callEquipmentNames.has(eq.name));

    if (teamEquipment.length > 0) {
      const callAfterUpdate = (updatedCalls || event?.calls || []).find(c => c.id === callId);
      
      if (isEqDetaching) {
        // Delivered Eq: transfer to patient care team
        updatedEquipment = event?.eventEquipment?.map(eq =>
          eq.assignedTeam === team
            ? {
                ...eq,
                assignedTeam: null,
                status: 'Available',
                location: callAfterUpdate?.assignedTeam?.[0] || 'Clinic'
              }
            : eq
        );
      } else if (newStatus === 'Assisting') {
        // Assisting: keep with assisting team
        updatedEquipment = event?.eventEquipment?.map(eq =>
          eq.assignedTeam === team
            ? {
                ...eq,
                location: team
              }
            : eq
        );
      } else {
        // Case A: Call has no remaining assigned teams → resolve equipment to Clinic
        const noTeamsRemain = !callAfterUpdate?.assignedTeam || callAfterUpdate.assignedTeam.length === 0;
        const callResolvedLike = ['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Unable to Locate', 'Rolled'].includes(
          callAfterUpdate?.status || newCallStatus
        );

        if (noTeamsRemain && callResolvedLike) {
          // If the call was Delivered to clinic, mark equipment as In Clinic
          // but keep the same team recorded as the assignedTeam (they delivered it).
          const resolvedStatus = callAfterUpdate?.status || newCallStatus;
          if (resolvedStatus === 'Delivered') {
            updatedEquipment = event?.eventEquipment?.map(eq =>
              resolvingTeams.includes(eq.assignedTeam || '')
                ? {
                    ...eq,
                    // keep assignedTeam so history shows who delivered it
                    assignedTeam: eq.assignedTeam,
                    status: 'In Clinic' as EquipmentStatus,
                    location: 'Clinic'
                  }
                : eq
            );
          } else {
            updatedEquipment = event?.eventEquipment?.map(eq =>
              resolvingTeams.includes(eq.assignedTeam || '')
                ? {
                    ...eq,
                    assignedTeam: null,
                    status: 'Available' as EquipmentStatus,
                    location: 'Clinic'
                  }
                : eq
            );
          }
        } else {
          // Other teams remain on the call or the call is still active.
          // Keep equipment marked as In Use and preserve/transfer assignment appropriately.
          const newAssigned = (callAfterUpdate?.assignedTeam && callAfterUpdate.assignedTeam.length > 0)
            ? (callAfterUpdate.assignedTeam.includes(team) ? team : callAfterUpdate.assignedTeam[0])
            : team;

          updatedEquipment = event?.eventEquipment?.map(eq =>
            eq.assignedTeam === team
              ? {
                  ...eq,
                  assignedTeam: newAssigned,
                  status: 'In Use' as EquipmentStatus,
                  location: callAfterUpdate?.location || eq.location || newAssigned || 'Roaming'
                }
              : eq
          );
        }
      }
    }

    // Update the event with all changes
    updateEvent({
      calls: updatedCalls,
      staff: updatedStaff,
      postAssignments,
      ...(updatedSupervisor && { supervisor: updatedSupervisor }),
      ...(updatedEquipment && { eventEquipment: updatedEquipment })
    });
  };

  // Reverses a single detached-team entry (regular team, equipment run, or auto-detached
  // supervisor): restores its prior status/location, re-attaches it to the call, and — for a
  // regular team — recomputes the call's composite status and clears clinic membership if
  // nothing else on the call is still Delivered.
  const handleRevertDetachment = (callId: string, team: string) => {
    const call = event?.calls.find(c => c.id === callId);
    if (!call) return;
    const detachedEntry = call.detachedTeams?.find(d => d.team === team);
    if (!detachedEntry) return;

    const kind = detachedEntry.kind || 'team';
    const confirmMessage =
      kind === 'equipment' ? t('Revert this equipment status and reattach it to the team?')
      : kind === 'supervisor' ? t('Revert this supervisor detachment and reattach them to the call?')
      : t('Revert this status and reopen the call?');

    if (!confirm(confirmMessage)) return;

    const restoredStatus = detachedEntry.previousStatus || (kind === 'equipment' ? 'En Route Eq' : 'En Route');
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
    const logMessage = `${hhmm} - ${team} status reverted, ${kind === 'supervisor' ? 'supervisor reattached' : kind === 'equipment' ? 'equipment run reattached' : 'call reopened'}`;

    setTeamStatusMap(prev => ({
      ...prev,
      [callId]: {
        ...(prev[callId] || {}),
        [team]: restoredStatus
      }
    }));

    const updatedCalls = (event?.calls || []).map(c => {
      if (c.id !== callId) return c;

      const remainingDetached = (c.detachedTeams || []).filter(d => d.team !== team);
      const updatedLog = [...(c.log || []), { timestamp: now.getTime(), message: logMessage }];

      let updatedAssignedTeam = c.assignedTeam || [];
      let updatedEquipmentTeams = c.equipmentTeams || [];

      if (!updatedAssignedTeam.includes(team)) {
        updatedAssignedTeam = [...updatedAssignedTeam, team];
      }
      if (kind === 'equipment' && !updatedEquipmentTeams.includes(team)) {
        updatedEquipmentTeams = [...updatedEquipmentTeams, team];
      }

      let newCallStatus = c.status;
      let clinicFlag = c.clinic;
      let clinicId = c.clinicId;
      let outcome = c.outcome;

      // Only the team whose OWN status change actually resolved the call
      // (reason is the resolving status itself, not 'Auto-detached') reopens
      // it on revert — reverting one of the other teams/equipment the
      // resolving cascade auto-released just restores that one team; the
      // call stays resolved via whichever distinction is still recorded.
      if (kind === 'team' && detachedEntry.reason !== 'Auto-detached') {
        if (restoredStatus === 'Transporting') newCallStatus = 'Transporting';
        else if (restoredStatus === 'On Scene') newCallStatus = 'On Scene';
        else newCallStatus = 'En Route';

        // If no other detached team on this call is still Delivered, the call is no longer
        // clinic-bound.
        const stillDelivered = remainingDetached.some(d => d.reason === 'Delivered');
        if (!stillDelivered) {
          clinicFlag = false;
          clinicId = undefined;
          outcome = undefined;
        }
      }

      return {
        ...c,
        status: newCallStatus,
        clinic: clinicFlag,
        clinicId,
        outcome,
        log: updatedLog,
        assignedTeam: updatedAssignedTeam,
        equipmentTeams: updatedEquipmentTeams,
        detachedTeams: remainingDetached,
      };
    });

    let updatedStaff = event?.staff;
    let updatedSupervisor = event?.supervisor;

    if (kind === 'supervisor') {
      updatedSupervisor = event?.supervisor?.map(s =>
        s.team === team
          ? {
              ...s,
              status: restoredStatus,
              location: detachedEntry.previousLocation || s.location,
              log: [...(s.log || []), { timestamp: now.getTime(), message: logMessage }],
            }
          : s
      );
    } else {
      updatedStaff = event?.staff.map(t =>
        t.team === team
          ? {
              ...t,
              status: restoredStatus,
              location: detachedEntry.previousLocation || call.location,
            }
          : t
      );
    }

    let updatedEquipment = event?.eventEquipment;
    if (kind === 'equipment' && detachedEntry.equipmentNames?.length) {
      updatedEquipment = event?.eventEquipment?.map(eq =>
        detachedEntry.equipmentNames?.includes(eq.name)
          ? { ...eq, assignedTeam: team, status: 'In Use' as EquipmentStatus, location: call.location }
          : eq
      );
    }

    updateEvent({
      calls: updatedCalls,
      ...(updatedStaff && { staff: updatedStaff }),
      ...(updatedSupervisor && { supervisor: updatedSupervisor }),
      ...(updatedEquipment && { eventEquipment: updatedEquipment }),
    });
  };

  // Shared clinic-outcome change handler used by both ClinicTrackingTable and
  // ClinicTrackingCard. Selecting 'Transported' doesn't commit immediately — it opens
  // TransportUnitModal to capture the ambulance/transport unit number first.
  const handleClinicOutcomeChange = useCallback((callId: string, outcome: string) => {
    if (outcome === 'Transported') {
      setTransportUnitCallId(callId);
      setTransportUnitValue('');
      setShowTransportUnitModal(true);
      return;
    }

    updateEvent((current) => {
      const callToUpdate = current.calls.find(c => c.id === callId);
      if (!callToUpdate) return {};

      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const updatedCall = {
        ...callToUpdate,
        outcome: outcome === 'In Clinic' ? undefined : outcome as ClinicOutcome,
        transportUnit: outcome === 'In Clinic' ? undefined : callToUpdate.transportUnit,
        log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Clinic Status: ${outcome}` }]
      };
      // Pin only matters while a clinic call is still active/unresolved.
      updatedCall.pin = isClinicCallResolved(updatedCall) ? false : updatedCall.pin;
      return { calls: current.calls.map(c => c.id === callId ? updatedCall : c) };
    });
  }, [updateEvent]);

  const handleSubmitTransportUnit = useCallback(async () => {
    if (!transportUnitCallId) return;
    const callId = transportUnitCallId;
    const unit = transportUnitValue.trim();

    await updateEvent((current) => {
      const callToUpdate = current.calls.find(c => c.id === callId);
      if (!callToUpdate) return {};

      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const updatedCall = {
        ...callToUpdate,
        outcome: 'Transported' as ClinicOutcome,
        transportUnit: unit || undefined,
        pin: false, // 'Transported' is always a terminal clinic outcome
        log: [
          ...(callToUpdate.log || []),
          { timestamp: now.getTime(), message: unit ? `${hhmm} - Transferred to ambulance, unit #: ${unit}` : `${hhmm} - Transferred to ambulance` }
        ]
      };
      return { calls: current.calls.map(c => c.id === callId ? updatedCall : c) };
    });

    setShowTransportUnitModal(false);
    setTransportUnitCallId(null);
    setTransportUnitValue('');
  }, [transportUnitCallId, transportUnitValue, updateEvent]);

  // Calls-side "Transferred to ambulance" (Rolled from Scene) — same unit-number
  // prompt pattern as the clinic modal above, then routes through the normal
  // handleTeamStatusChange resolving cascade with the entered unit attached.
  const handleSubmitCallTransportUnit = useCallback(async () => {
    if (!callTransportUnitCallId || !callTransportUnitTeam) return;
    const unit = callTransportUnitValue.trim();
    handleTeamStatusChange(callTransportUnitCallId, callTransportUnitTeam, 'Rolled from Scene', undefined, unit || undefined);

    setShowCallTransportUnitModal(false);
    setCallTransportUnitCallId(null);
    setCallTransportUnitTeam(null);
    setCallTransportUnitValue('');
  }, [callTransportUnitCallId, callTransportUnitTeam, callTransportUnitValue, handleTeamStatusChange]);

  const handleRevertClinicOutcome = useCallback(async (callId: string) => {
    if (!confirm(t('Revert this clinic outcome?'))) return;

    await updateEvent((current) => {
      const callToUpdate = current.calls.find(c => c.id === callId);
      if (!callToUpdate) return {};

      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const updatedCall = {
        ...callToUpdate,
        outcome: undefined,
        transportUnit: undefined,
        log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Clinic outcome reverted to In Clinic` }]
      };
      return { calls: current.calls.map(c => c.id === callId ? updatedCall : c) };
    });
  }, [updateEvent, t]);

  const [showResolvedCalls, setShowResolvedCalls] = useState(false);

  const [teamSortMode, setTeamSortMode] = useState<'availability' | 'asc' | 'desc'>('asc');
  const [cardViewMode, setCardViewMode] = useState<'normal' | 'condensed'>('normal');
  const [callSortMode, setCallSortMode] = useState<CallSortMode>('newest');

  const [selectedLeftTab, setSelectedLeftTab] = useState<string>('teams');
  const [selectedRightTab, setSelectedRightTab] = useState<string>('calls');
  // Which dispatch zone(s) the Calls tab is scoped to — the 'all' sentinel
  // means unfiltered ("All Calls"); it's mutually exclusive with any zone
  // id, enforced in the dropdown's onSelectionChange below, never both at
  // once. Replaces one-tab-per-zone with a single Calls tab + dropdown.
  const [callZoneFilter, setCallZoneFilter] = useState<Set<string>>(new Set(['all']));
  // Controlled so picking "All Calls" can close the dropdown itself while
  // picking a zone leaves it open for further multi-select picks.
  const [mobileTeamsSubTab, setMobileTeamsSubTab] = useState<'teams' | 'supervisors'>('teams');
  const [mobileActiveTab, setMobileActiveTab] = useState<string>('teams');
  const [mobileSelectedClinicId, setMobileSelectedClinicId] = useState<string>('');
  // Set alongside switching to the Map tab from a team card's "view on
  // map" button. requestId must change on every click (not just teamName)
  // since the Map tab may already be open and wouldn't otherwise notice a
  // repeat request for the same team.
  const [mapTeamFocusRequest, setMapTeamFocusRequest] = useState<TeamFocusRequest | null>(null);
  const viewTeamOnMap = (teamName: string) => {
    setMapTeamFocusRequest({ teamName, requestId: Date.now() });
    setSelectedRightTab('map');
  };
  // Same as mapTeamFocusRequest/viewTeamOnMap, for a supervisor card's "view on map" button.
  const [mapSupervisorFocusRequest, setMapSupervisorFocusRequest] = useState<SupervisorFocusRequest | null>(null);
  const viewSupervisorOnMap = (supervisorName: string) => {
    setMapSupervisorFocusRequest({ supervisorName, requestId: Date.now() });
    setSelectedRightTab('map');
  };
  // Same as mapTeamFocusRequest/viewTeamOnMap, for an equipment card's "view on map" button.
  const [mapEquipmentFocusRequest, setMapEquipmentFocusRequest] = useState<EquipmentFocusRequest | null>(null);
  const viewEquipmentOnMap = (equipmentName: string) => {
    setMapEquipmentFocusRequest({ equipmentName, requestId: Date.now() });
    setSelectedRightTab('map');
  };

  // Matches the lg breakpoint used by the desktop/mobile CSS split below —
  // keeps CallTrackingTable/Card and ClinicTrackingTable/Card from both being
  // mounted at once (they'd otherwise share data-testids and thrash React
  // state on every call/team update while off-screen).
  const isMobile = useIsMobile(1024);


  
  useEffect(() => {
    const handleHotkey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        setShowQuickCallForm(true);
        setTimeout(() => {
          (document.querySelector('input[name="callLocation"]') as HTMLInputElement | null)?.focus();
        }, 10);
      }
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setSelectedRightTab('map');
      }
      if (e.key === 'Escape') {
        setShowQuickCallForm(false);
      }
      // Bare Tab cycles the left sidebar tabs, unless focus is in a control
      // that should get normal tab navigation.
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const active = document.activeElement;
        if (active && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(active.tagName)) return;
        e.preventDefault();
        setSelectedLeftTab((current) => LEFT_PANEL_TABS[(LEFT_PANEL_TABS.indexOf(current as LeftPanelTab) + 1) % LEFT_PANEL_TABS.length]);
      }
    };
    // Single keydown listener for all page-level hotkeys.
    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  }, []);

   useEffect(() => {
    if (!eventId) {
      console.error('eventId is undefined or null, skipping event subscription');
      return;
    }

    if (isLiteMode) {
      let cancelled = false;

      const loadLiteEvent = async () => {
        try {
          const draft = await getLiteEvent(eventId);
          if (cancelled) return;

          if (!draft) {
            setEvent(undefined);
            router.push('/lite/create');
            return;
          }

          const activeDraft =
            draft.status === 'draft' ? { ...draft, status: 'active' as const } : draft;

          if (activeDraft !== draft) {
            await saveLiteEvent(activeDraft);
          }

          const normalizedEvent = normalizeLiteDraftToEvent(activeDraft);
          setEvent((prev) => {
            if (!isEqual(prev, normalizedEvent)) {
              return normalizedEvent;
            }
            return prev;
          });
          setPostAssignments(normalizedEvent.postAssignments || {});
        } catch (error) {
          console.error('Error loading local event:', error);
          setEvent(undefined);
          router.push('/lite/create');
        }
      };

      void loadLiteEvent();
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      return;
    }
    const unsubscribe = dbService.subscribeToDocument<Event>(
      'events',
      eventId,
      (snap) => {
        if (snap.exists && snap.data) {
          const eventData = snap.data;
          // Debug: log event document contents to diagnose missing postingTimes
          // eslint-disable-next-line no-console
          console.log('Snapshot - eventData:', {
            id: snap.id,
            postingTimes: eventData.postingTimes,
            postAssignments: eventData.postAssignments,
            eventDataSample: {
              id: eventData.id,
              name: eventData.name,
              date: eventData.date,
              eventPostsLength: (eventData.eventPosts || []).length,
              staffLength: (eventData.staff || []).length,
            }
          });

          const userEmail = user.email?.toLowerCase();
          const isSharedUser = eventData.sharedWith?.some(email => email.toLowerCase() === userEmail);
          const isOrgShow = eventData.isOrgEvent === true;

          if (eventData.userId && eventData.userId !== user.uid && !isAdmin && !isSharedUser && !isOrgShow) {
            console.error('Unauthorized access to event');
            sessionStorage.setItem('redirectPath', `/events/${eventId}/dispatch`);
            router.push('/?login=true&error=unauthorized');
            return;
          }
          setEvent(prev => {
            if (!isEqual(prev, eventData)) {
              setPostAssignments(eventData.postAssignments || {});
              return eventData;
            }
            return prev;
          });
        } else {
          setEvent(undefined);
          router.push('/venues/selection');
        }
      },
      (error) => {
        console.error('Error fetching event:', error);
        // Handle permission errors
        if (error instanceof ServiceError && error.code === 'permission-denied') {
          sessionStorage.setItem('redirectPath', `/events/${eventId}/dispatch`);
          router.push('/?login=true&error=unauthorized');
        }
      },
    );
    return () => unsubscribe();
  }, [eventId, user, router, isAdmin, isLiteMode]);

  // Lazily backfill/refresh event.clinics from the venue's clinic-flagged posts
  // (additive — never removes an entry, so existing calls' clinicId never orphans).
  useEffect(() => {
    if (!event || isEventEnded(event)) return;
    const synced = syncClinicsFromVenue(event.venue, event.clinics);
    if (!isEqual(synced, event.clinics || [])) {
      void updateEvent({ clinics: synced });
    }
  }, [event, updateEvent]);

  // Same lazy backfill/refresh, for dispatch-zone-flagged venue zones.
  useEffect(() => {
    if (!event || isEventEnded(event)) return;
    const synced = syncDispatchZonesFromVenue(event.venue, event.dispatchZones);
    if (!isEqual(synced, event.dispatchZones || [])) {
      void updateEvent({ dispatchZones: synced });
    }
  }, [event, updateEvent]);

  const handleRemoveTeamFromCall = async (callId: string, teamToRemove: string) => {
    if (!event) return;
    
    // Find the call and team objects
    const call = event.calls.find(c => c.id === callId);
    const team = event.staff.find(t => t.team === teamToRemove);
    
    if (!call || !team) return;
  
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + 
                 now.getMinutes().toString().padStart(2, '0');
  
    // Update call log
    const callLogEntry: CallLogEntry = {
      timestamp: now.getTime(),
      message: `${hhmm} - ${teamToRemove} detached from call.`
    };
  
    // Update team log
    const teamLogEntry: TeamLogEntry = {
      timestamp: now.getTime(),
      message: `${hhmm} - detached from call #${callDisplayNumberMap.get(callId)} (${callId}); back to post at ${team.location}`
    };
  
    // Update call: remove team and add log
    const updatedCall: Call = {
      ...call,
      assignedTeam: (call.assignedTeam || []).filter(t => t !== teamToRemove),
      status: (call.assignedTeam || []).length <= 1 ? 'Pending' : call.status,
      log: [...(call.log || []), callLogEntry]
    };
  
    // Update team: reset status and add log
    const updatedTeam: Staff = {
      ...team,
      status: 'Available',
      log: [...(team.log || []), teamLogEntry]
    };
  
    // Create updated arrays
    const updatedCalls = event.calls.map(c => 
      c.id === callId ? updatedCall : c
    );
    
    const updatedStaff = event.staff.map(t => 
      t.team === teamToRemove ? updatedTeam : t
    );
  
    // Save to Firestore
    await updateEvent({ 
      calls: updatedCalls, 
      staff: updatedStaff,
      postAssignments
    });
  };  

  // const handlePostAssignment = async (time: string, postKey: string, team: string) => {
  //   const updatedAssignments = {
  //     ...postAssignments,
  //     [time]: {
  //       ...(postAssignments[time] || {}),
  //       [postKey]: team,
  //     },
  //   };
  //   setPostAssignments(updatedAssignments);
  //   await updateEvent({ postAssignments: updatedAssignments });
  // };

  // const handleClearAllPostAssignments = async () => {
  //   if (!event) return;

  //   const clearedAssignments: { [time: string]: { [post: string]: string } } = {};
  //   for (const time of event.postingTimes || []) {
  //     clearedAssignments[time] = {};
  //     for (const post of event.eventPosts || []) {
  //       const postKey = getPostKey(post);
  //       clearedAssignments[time][postKey] = '';
  //     }
  //   }

  //   setPostAssignments(clearedAssignments);
  //   await updateEvent({ postAssignments: clearedAssignments });
  // };

  // const handleUpdatePostingTime = async (originalTime: string, newTime: string) => {
  //   if (!event) return;
    
  //   const newPostingTimes = event.postingTimes?.map(time => 
  //     time === originalTime ? newTime : time
  //   ) || [];

  //   // Update post assignments
  //   const newPostAssignments = { ...postAssignments };
  //   if (newPostAssignments[originalTime]) {
  //     newPostAssignments[newTime] = newPostAssignments[originalTime];
  //     delete newPostAssignments[originalTime];
  //   }

  //   // Update Firestore
  //   await updateEvent({
  //     postingTimes: newPostingTimes,
  //     postAssignments: newPostAssignments
  //   });
  // };

  // Right-click menu opener
  // const handleRightClick = (e: React.MouseEvent, callId: string) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   setContextMenu({
  //     x: e.clientX,
  //     y: e.clientY,
  //     callId,
  //   });
  // };

  // Mark a call as duplicate
  const handleMarkDuplicate = async (callId: string) => {
    setSelectedDuplicateCallId(callId);
    setShowDuplicateModal(true);
    setContextMenu(null);
  };

  const handleResolveDuplicate = async (duplicateCallId: string, originalCallId: string) => {
    const duplicateCall = event?.calls.find(c => c.id === duplicateCallId);
    if (!duplicateCall) return;

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    const originalCallNumber = callDisplayNumberMap.get(originalCallId);

    // Update call log with duplicate resolution
    const newLogEntry: CallLogEntry = {
      timestamp: now.getTime(),
      message: `${hhmm} - Resolved, duplicate to call #${originalCallNumber}`
    };

    // Update call: set duplicate & status
    const updatedCall: Call = {
      ...duplicateCall,
      duplicate: true,
      duplicateOf: originalCallId,
      status: 'Resolved',
      // Clear assigned teams when marking as duplicate
      assignedTeam: [],
      log: [...(duplicateCall.log || []), newLogEntry]
    };

    // If there were teams assigned to this duplicate call, we should free them up
    if (duplicateCall.assignedTeam && duplicateCall.assignedTeam.length > 0) {
      const updatedStaff = event?.staff.map(staff => {
        if (duplicateCall.assignedTeam?.includes(staff.team)) {
          // Free up the team - set them back to Available status at their original location
          const teamLogEntry: TeamLogEntry = {
            timestamp: now.getTime(),
            message: `${hhmm} - freed from duplicate call #${callDisplayNumberMap.get(duplicateCallId)}, back to post`
          };
          
          return {
            ...staff,
            status: 'Available',
            location: staff.originalPost || staff.location || 'Unknown',
            log: [...(staff.log || []), teamLogEntry]
          };
        }
        return staff;
      });

      // Update both calls and staff
      const updatedCalls = event?.calls.map(c => c.id === duplicateCallId ? updatedCall : c);
      
      await updateEvent({ 
        calls: updatedCalls,
        staff: updatedStaff,
        postAssignments
      });
    } else {
      // Just update the call
      const updatedCalls = event?.calls.map(c => c.id === duplicateCallId ? updatedCall : c);
      await updateEvent({ calls: updatedCalls });
    }

    setShowDuplicateModal(false);
    setSelectedDuplicateCallId(null);
  };

  const handleTogglePriority = async (callId: string, priority: boolean) => {
    const call = event?.calls.find(c => c.id === callId);
    if (!call) return;

    // Get the current time in HHMM format
    const now = new Date();
    const hhmm =
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');

    // Build log message based on checked status
    const logMessage = `${hhmm} - ${
      priority ? 'marked as Priority' : 'unmarked as Priority'
    }`;

    // Add the new log entry
    const updatedCall = {
      ...call,
      priority,
      log: [...(call.log || []), { timestamp: now.getTime(), message: logMessage }]
    };

    // Update the calls array
    const updatedCalls = event?.calls.map(c =>
      c.id === callId ? updatedCall : c
    );

    await updateEvent({ calls: updatedCalls });
  };

  // Toggle Priority (as before)
  const handleTogglePriorityFromMenu = async (callId: string) => {
    const call = event?.calls.find(c => c.id === callId);
    if (!call) return;

    await handleTogglePriority(callId, !call.priority);
    setContextMenu(null);
  };

  // Pins/unpins a call — unlike priority, this never adds a log entry, and
  // gets forced back off automatically once the call resolves (see the
  // resolve branches in handleTeamStatusChange and the clinic-outcome
  // handlers below).
  const handleTogglePin = async (callId: string) => {
    const call = event?.calls.find(c => c.id === callId);
    if (!call) return;

    const updatedCalls = event?.calls.map(c =>
      c.id === callId ? { ...c, pin: !c.pin } : c
    );

    await updateEvent({ calls: updatedCalls });
    setContextMenu(null);
  };

  // Close menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    const handleScroll = () => setContextMenu(null);

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [contextMenu]);
  
  const addTeamLog = useCallback((staff: Staff, message: string): Staff => {
    const now = new Date();
    const hhmm =
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');
    const newEntry = { timestamp: now.getTime(), message: `${hhmm} - ${message}` };
    return {
      ...staff,
      log: [...(staff.log || []), newEntry],
    };
  }, []);

  const handleStatusChange = useCallback(async (staff: Staff, newStatus: string, clinicId?: string) => {
    const team = staff.team;

    setTeamTimers(prev => ({ ...prev, [team]: Date.now() }));

    await updateEvent((currentEvent) => {

      const activeCall = currentEvent.calls.find(c =>
        c.assignedTeam?.includes(team) &&
        !['Resolved', 'Available'].includes(c.status)
      );
      const callId = activeCall?.id;

      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const resolvedClinicId = newStatus === 'Transporting'
        ? (clinicId ?? activeCall?.clinicId ?? currentEvent.clinics?.[0]?.id ?? 'clinic')
        : activeCall?.clinicId;
      const destinationClinicName = newStatus === 'Transporting'
        ? getClinicName(getEventClinics(currentEvent.clinics), resolvedClinicId)
        : undefined;
      // Matches the calls-tracker's own phrasing for these two cases;
      // "at <location>" gives every other status real context (which call
      // it belongs to) without needing a separate call reference.
      const logMessage = newStatus === 'Transporting'
        ? `${hhmm} - ${team} transporting to ${destinationClinicName || 'clinic'}`
        : `${hhmm} - ${team} set to ${newStatus}${activeCall ? ` at ${activeCall.location}` : ''}`;

      const updatedStaff = (currentEvent.staff || []).map(s => {
        if (s.team !== team) return s;
        
        const teamLogEntry: TeamLogEntry = { timestamp: now.getTime(), message: logMessage };

        return {
            ...s,
            status: newStatus,
            // Location is never this handler's call — teamcard.tsx/
            // teamcard-condensed.tsx already compute the right destination
            // (originalPost, a pending assignment, or the last valid
            // location) and apply it via their own onLocationChange before
            // calling this. Overwriting it here with a cruder originalPost-
            // or-'Roaming' fallback used to stomp on that right after.
            log: [...(s.log || []), teamLogEntry]
        };
      });

      // Update Calls Array (if team was on a call)
      let updatedCalls = currentEvent.calls || [];
      if (callId) {
         updatedCalls = updatedCalls.map(c => {
            if (c.id !== callId) return c;
            
            const assignedTeams = c.assignedTeam || [];
            const teamStatuses = assignedTeams.map(t => {
                if (t === team) return newStatus; // The new status for current team
                const s = updatedStaff.find(st => st.team === t);
                return s ? s.status : 'Available';
            });

            // Calculate new composite status for the call
            let newCallStatus = c.status;
            if (teamStatuses.includes('Transporting')) newCallStatus = 'Transporting';
            else if (teamStatuses.includes('Pending Transport')) newCallStatus = 'Pending Transport';
            else if (teamStatuses.includes('On Scene')) newCallStatus = 'On Scene';
            else if (teamStatuses.includes('En Route')) newCallStatus = 'En Route';

            return {
                ...c,
                status: newCallStatus,
                clinicId: newStatus === 'Transporting' ? resolvedClinicId : c.clinicId,
                log: [...(c.log || []), { timestamp: now.getTime(), message: logMessage }]
            };
         });
      }

      return {
        staff: updatedStaff,
        calls: updatedCalls
      };
    });
  }, [updateEvent]);

  const handleLocationChange = useCallback(async (staff: Staff, newLocation: string) => {
    // On a live-tracking event Location is where the team is, never its post, and never sets a status (D66).
    const tracked = event?.mapMode === 'tak';
    const updatedStaff = event?.staff.map(t =>
      t.team === staff.team
        ? addTeamLog(
            {
              ...t,
              location: newLocation,
              status: !tracked && newLocation === 'Clinic' && t.status === 'Available' ? 'In Clinic' : t.status,
            },
            `${tracked ? 'Location' : 'Post'} changed to ${newLocation}`
          )
        : t
    );
    await updateEvent({ 
      staff: updatedStaff,
      postAssignments // Explicitly preserve postAssignments
    }, { locationEdits: [staff.team] });
  }, [event, updateEvent, addTeamLog, postAssignments]); // Add postAssignments dependency

  const handleAddTeamToCall = async (callId: string, team: string) => {
    if (!team || !event) return;
    const call = event.calls.find(c => c.id === callId);
    if (!call) return;
  
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') +
                 now.getMinutes().toString().padStart(2, '0');

    // Update call log
    const callLogEntry: CallLogEntry = {
      timestamp: now.getTime(),
      message: withPendingSuffix(`${hhmm} - ${team} assigned and en route.`, call, now)
    };

    // Update team log
    const teamLogEntry: TeamLogEntry = {
      timestamp: now.getTime(),
      message: `${hhmm} - responding to call #${callDisplayNumberMap.get(callId)} (${callId})`
    };
  
    const updatedCall: Call = {
      ...call,
      assignedTeam: [...(call.assignedTeam || []), team],
      status: 'Assigned',
      log: [...(call.log || []), callLogEntry]
    };
  
    const updatedStaff = event.staff.map(t => 
      t.team === team
        ? {
            ...t,
            status: 'En Route',
            location: call.location,
            originalPost: t.location || 'Unknown', // Save original post
            log: [...(t.log || []), teamLogEntry]
          }
        : t
    );
  
    const updatedCalls = event.calls.map(c => 
      c.id === callId ? updatedCall : c
    );

    // Update equipment: mark as In Use any equipment already assigned to this team
    // or explicitly listed on the call's equipment list.
    let updatedEquipment = event.eventEquipment || [];
    try {
      const callEquipmentNames = new Set(
        (call.equipment || []).map((n: unknown) => (typeof n === 'string' ? n : (n as { name?: string }).name || ''))
      );
      updatedEquipment = (event.eventEquipment || []).map(eq => {
        const eqName = eq.name;
        const isListedOnCall = callEquipmentNames.has(eqName);
        const isCurrentlyAssignedToTeam = eq.assignedTeam === team;
        if (isListedOnCall || isCurrentlyAssignedToTeam) {
          return {
            ...eq,
            assignedTeam: team,
            status: 'In Use' as EquipmentStatus,
            location: call.location || eq.location || team
          };
        }
        return eq;
      });
    } catch (e) {
      console.error('Error updating equipment on team add:', e);
    }

    await updateEvent({ 
      calls: updatedCalls, 
      staff: updatedStaff,
      postAssignments,
      eventEquipment: updatedEquipment
    });

    setTeamToAdd(prev => ({ ...prev, [callId]: '' }));
  };    

  const handleCallUpdate = async (callId: string, updates: Partial<Call>) => {
    const updatedCalls = event?.calls?.map(call => 
      call.id === callId ? { ...call, ...updates } : call
    ) || [];
    await updateEvent({ calls: updatedCalls });
  };

 
  // Tracks when a team entered its current status, in ms since epoch
  const [teamTimers, setTeamTimers] = useState<{ [team: string]: number }>({});
  // Cache last known status per team so we only update on true status changes
  const lastTeamStatus = useRef<{ [team: string]: string }>({});
  // Cache last known "status since" per team derived from logs to avoid using Date.now() except on true status change
  const lastStatusSince = useRef<{ [team: string]: number }>({});

  const staffSignature = useMemo(() => {
    if (!event?.staff) return '';
    return event.staff
      .map(t => `${t.team}|${t.status}|${t.location}`)
      .join(',');
  }, [event?.staff]);

  useEffect(() => {
    if (!event?.staff && !event?.supervisor) return;
    
    setTeamTimers(prev => {
      const updated: { [team: string]: number } = { ...prev };
      const currentTeamNames = [
        ...(event.staff?.map(t => t.team) || []),
        ...(event.supervisor?.map(s => s.team) || [])
      ];
      
      // Handle regular teams
      event.staff?.forEach(team => {
        const key = team.team;
        const status = team.status;
        const location = team.location;
        const hadEntry = key in lastTeamStatus.current;
        const lastKey = lastTeamStatus.current[key];
        const combinedKey = `${status}|${location}`;
        
        if (!hadEntry) {
          lastTeamStatus.current[key] = combinedKey;
          const fromLog = team.statusSince ?? deriveStatusSinceFromLogs(team, event.calls);
          const seeded = typeof fromLog === 'number' ? fromLog : 
                      typeof updated[key] === 'number' ? updated[key] : Date.now();
          updated[key] = seeded;
          lastStatusSince.current[key] = seeded;
          return;
        }
        
        if (lastKey !== combinedKey) {
          lastTeamStatus.current[key] = combinedKey;
          const fromLog = team.statusSince ?? deriveStatusSinceFromLogs(team, event.calls);
          const newSince = typeof fromLog === 'number' ? fromLog : Date.now();
          updated[key] = newSince;
          lastStatusSince.current[key] = newSince;
        } else {
          // A stored statusSince (e.g. from another dispatcher's write) wins over the cache.
          const cached = team.statusSince ?? lastStatusSince.current[key];
          if (typeof cached === 'number') {
            updated[key] = cached;
            lastStatusSince.current[key] = cached;
          }
        }
      });
      
      // Handle supervisors
      event.supervisor?.forEach(supervisor => {
        const key = supervisor.team;
        const status = supervisor.status;
        const location = supervisor.location;
        const hadEntry = key in lastTeamStatus.current;
        const lastKey = lastTeamStatus.current[key];
        const combinedKey = `${status}|${location}`;
        
        if (!hadEntry) {
          lastTeamStatus.current[key] = combinedKey;
          const fromLog = supervisor.statusSince ?? deriveStatusSinceFromLogs(supervisor, event.calls);
          const seeded = typeof fromLog === 'number' ? fromLog : 
                      typeof updated[key] === 'number' ? updated[key] : Date.now();
          updated[key] = seeded;
          lastStatusSince.current[key] = seeded;
          return;
        }
        
        if (lastKey !== combinedKey) {
          lastTeamStatus.current[key] = combinedKey;
          const fromLog = supervisor.statusSince ?? deriveStatusSinceFromLogs(supervisor, event.calls);
          const newSince = typeof fromLog === 'number' ? fromLog : Date.now();
          updated[key] = newSince;
          lastStatusSince.current[key] = newSince;
        } else {
          const cached = supervisor.statusSince ?? lastStatusSince.current[key];
          if (typeof cached === 'number') {
            updated[key] = cached;
            lastStatusSince.current[key] = cached;
          }
        }
      });
      
      // Clean up removed teams/supervisors
      Object.keys(updated).forEach(teamKey => {
        if (!currentTeamNames.includes(teamKey)) {
          delete updated[teamKey];
          delete lastTeamStatus.current[teamKey];
          delete lastStatusSince.current[teamKey];
        }
      });
      
      return updated;
    });
  }, [event?.staff, event?.supervisor, event?.calls, staffSignature]);

  const getCurrentActiveTime = useCallback(() => getActivePostingTime(event?.postingTimes), [event?.postingTimes]);


  // Find the currently "active" posting time and then
  // set each team's location to the post they are assigned to for that time.
  const refreshAllPostsFromSchedule = useCallback(async () => {
    if (!event) return;

    const active = getCurrentActiveTime();
    if (!active) {
      toast.info('No active posting time to refresh.');
      return;
    }

    const assignments = postAssignments[active] || {};
    if (!Object.keys(assignments).length) {
      toast.info(`No assignments found for ${active}.`);
      return;
    }

    const busy = new Set(['En Route', 'On Scene', 'Transporting', 'In Clinic']);
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    let changed = 0;
    const updatedStaff = (event.staff || []).map(t => {
      // find which post assigns this team
      const postForTeam = Object.entries(assignments).find(([, team]) => team === t.team)?.[0];
      if (!postForTeam) return t;

      // if you want to force even when busy, remove this busy check:
      if (busy.has(t.status)) {
        return t; // skip busy teams
      }

      if (t.location === postForTeam) return t;

      changed++;
      return {
        ...t,
        location: postForTeam,
        log: [
          ...(t.log || []),
          { timestamp: now.getTime(), message: `${hhmm} - Post changed to ${postForTeam} (manual refresh)` }
        ],
      };
    });

    if (changed > 0) {
      await updateEvent({ staff: updatedStaff });
      toast.success(`Refreshed ${changed} team${changed === 1 ? '' : 's'} to scheduled posts.`);
    } else {
      toast.info('No teams updated (either busy or already at scheduled posts).');
    }
  }, [event, postAssignments, getCurrentActiveTime, updateEvent]);

  // Update a single team (for the widget "Refresh Post" action)
  const refreshTeamFromSchedule = useCallback(async (teamName: string) => {
    if (!event) return;

    const active = getCurrentActiveTime();
    if (!active) {
      toast.info('No active posting time to refresh.');
      return;
    }
    const assignments = postAssignments[active] || {};
    const postForTeam = Object.entries(assignments).find(([, team]) => team === teamName)?.[0];

    if (!postForTeam) {
      toast.info(`No scheduled post for ${teamName} at ${active}.`);
      return;
    }

    const team = (event.staff || []).find(s => s.team === teamName);
    if (!team) return;

    // if you want to prevent moving busy teams, keep this:
    if (['En Route', 'On Scene', 'Transporting', 'In Clinic'].includes(team.status)) {
      toast.info(`${teamName} is busy; not moved.`);
      return;
    }

    if (team.location === postForTeam) {
      toast.info(`${teamName} is already at ${postForTeam}.`);
      return;
    }

    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

    const updatedStaff = (event.staff || []).map(s =>
      s.team === teamName
        ? {
            ...s,
            location: postForTeam,
            log: [
              ...(s.log || []),
              { timestamp: now.getTime(), message: `${hhmm} - Post changed to ${postForTeam} (manual refresh)` }
            ],
          }
        : s
    );

    await updateEvent({ staff: updatedStaff });
    toast.success(`${teamName} → ${postForTeam}`);
  }, [event, postAssignments, getCurrentActiveTime, updateEvent]);

  const sortedAllCalls = useMemo(() => {
    if (!event?.calls) return [];
    return [...event.calls].sort((a, b) => parseInt(a.id) - parseInt(b.id)); // Oldest first
  }, [event?.calls]);
  
  const callDisplayNumberMap = useMemo(() => {
    const map = new Map();
    sortedAllCalls.forEach((call, index) => map.set(call.id, index + 1)); // 1 for first call
    return map;
  }, [sortedAllCalls]);

  // const activeCalls = useMemo(() => 
  //   sortedAllCalls.filter(call => call.status !== 'Resolved'), 
  //   [sortedAllCalls]
  // );

  function handleCellClick<K extends keyof Call>(callId: string, field: K, value?: Call[K]) {
    setEditingCell({ callId, field });
    setEditValue(typeof value === "string" ? value : value !== undefined && value !== null ? String(value) : "");
  }

  // function capitalize(str) {
  //   return str.charAt(0).toUpperCase() + str.slice(1);
  // }

  function camelCaseToTitle(str: string) {
    // Insert a space before all caps and capitalize the first letter
    return str
      .replace(/([A-Z])/g, ' $1') // chiefComplaint -> chief Complaint
      .replace(/^./, s => s.toUpperCase()); // chief Complaint -> Chief Complaint
  }

  async function handleCellBlur<K extends keyof Call>(callId: string, field: K) {
    const call = event?.calls.find(c => c.id === callId);
    if (!call) return;

    const prevValue = call[field];
    const newValue = editValue;

    if (prevValue !== newValue) {
      const now = new Date();
      const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const action = (prevValue === undefined || prevValue === "" || prevValue === null)
        ? "set"
        : "changed";
        const logMessage = `${hhmm} - ${camelCaseToTitle(field)} ${action} to ${newValue}.`;

      // Add log entry to the call's log
      const updatedCall = {
        ...call,
        [field]: newValue,
        log: [
          ...(call.log || []),
          { timestamp: now.getTime(), message: logMessage }
        ]
      };

      // Update the calls array
      const updatedCalls = event?.calls.map(c => c.id === callId ? updatedCall : c);

      await updateEvent({ calls: updatedCalls });
    } else {
      // If no change, just update the value (optional)
      await handleCallUpdate(callId, { [field]: newValue });
    }

    setEditingCell(null);
  }

  function notifyPostAssignmentChange(reason: string, details: Record<string, unknown>) {
    console.log("Post Assignment Change Notification Triggered", new Date().toLocaleTimeString(), "Reason:", reason, details);
    // Play sound
    const audio = new Audio('/alert.mp3'); // or use a URL
    audio.play();
  
    // Show toast notification
    toast.info("Reminder: Post Assignments are changing.", {
      position: "top-right",
      autoClose: 10000, // 10 seconds, or set as desired
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      transition: Slide,
    });
  }

  const handleExportSummaryCsv = useCallback(() => {
    if (!event) {
      toast.info('No summary logs to export yet.');
      return;
    }
    downloadTextFile(`${event.name || eventId || 'LiteEvent'}_Summary.csv`, buildLogSummaryCsv(event), 'text/csv;charset=utf-8;');
  }, [event, eventId]);

  const handleClearLiteEvent = useCallback(async () => {
    if (!isLiteMode || !eventId) return;

    const confirmed = window.confirm(
      'This will permanently clear this local event and all logs. This action is irreversible. Are you sure you want to continue?'
    );

    if (!confirmed) return;

    try {
      await deleteLiteEvent(eventId);
      toast.success('Local event cleared.');
      router.push('/lite');
    } catch (error) {
      console.error('Failed to clear local event:', error);
      toast.error('Failed to clear local event. Please try again.');
    }
  }, [isLiteMode, eventId, router]);

  // Ticks every 30s so the "ended by the 1-hour-no-activity backup" state
  // (a pure function of wall-clock time against the event's own End Time,
  // see src/lib/eventStatus.ts) is re-evaluated even when nothing about the
  // event itself has changed to trigger a re-render on its own.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const eventEnded = useMemo(() => (event ? isEventEnded(event, nowTick) : false), [event, nowTick]);

  // Only the event's creator or a site admin can end it.
  const canEndEvent = isLiteMode || isOrgAdmin || (!!user && !!event && event.userId === user.uid);

  const goToSummary = useCallback(() => {
    if (!eventId) return;
    router.push(`/events/${eventId}/summary`);
  }, [eventId, router]);

  const [showEndEventModal, setShowEndEventModal] = useState(false);

  const handleEndEvent = useCallback(async () => {
    if (!event || !eventId || !canEndEvent) return;

    await updateEvent(() => ({ ended: true, endedAt: Date.now() }), { bypassEndedCheck: true });
    setShowEndEventModal(false);

    // TAK live tracking (optional): mark the event's TAK config closed so the
    // bridge clears live positions and stops writing.
    if (process.env.NEXT_PUBLIC_TAK === 'on' && event.mapMode === 'tak' && !isLiteMode) {
      void import('@/features/tak')
        .then((m) => m.onEventEnded(eventId))
        .catch((err) => console.error('TAK: could not close the event config', err));
    }

    if (!isLiteMode) {
      window.dispatchEvent(new CustomEvent('dispatch-event-ended'));
    }

    goToSummary();
  }, [event, eventId, canEndEvent, updateEvent, isLiteMode, goToSummary]);

  const [showPostingSchedule, setShowPostingSchedule] = useState(false);
  const [showEventSummary, setShowEventSummary] = useState(false);

  useEffect(() => {
    const openPosting = () => setShowPostingSchedule(true);
    const openEventSummary = () => setShowEventSummary(true);
    const openEndEvent = () => {
      if (!canEndEvent) return;
      // Already ended (manually, or by the 1-hour-no-activity backup) — just
      // take them straight to the summary instead of asking again.
      if (eventEnded) {
        goToSummary();
        return;
      }
      setShowEndEventModal(true);
    };
    const openLiteClear = () => {
      void handleClearLiteEvent();
    };
    const openLiteExport = () => {
      handleExportSummaryCsv();
    };

    window.addEventListener('open-posting-schedule', openPosting);
    window.addEventListener('open-lite-clear-event', openLiteClear);
    window.addEventListener('open-lite-export-summary', openLiteExport);

    if (!isLiteMode) {
      window.addEventListener('open-event-summary', openEventSummary);
      window.addEventListener('open-end-event', openEndEvent);
    }

    return () => {
      window.removeEventListener('open-posting-schedule', openPosting);
      window.removeEventListener('open-lite-clear-event', openLiteClear);
      window.removeEventListener('open-lite-export-summary', openLiteExport);

      if (!isLiteMode) {
        window.removeEventListener('open-event-summary', openEventSummary);
        window.removeEventListener('open-end-event', openEndEvent);
      }
    };
  }, [isLiteMode, handleClearLiteEvent, handleExportSummaryCsv, eventEnded, goToSummary, canEndEvent]);

  useEffect(() => {
    if (isLiteMode) return;

    if (ready && !user) {
      // Store the current path for redirect after login
      sessionStorage.setItem('redirectPath', `/events/${eventId}/dispatch`);
      router.push('/?login=true&error=auth');
    }
  }, [user, ready, router, eventId, isLiteMode]);

  // Auto-activates the manual surge toggle when the automatic percent-on-calls
  // threshold (surgeLimitPercent) is first crossed. Edge-triggered off a ref
  // rather than continuously synced, so a dispatcher who manually turns the
  // surge back off isn't immediately re-flipped while the team is still above
  // threshold — only a fresh crossing (drop below, then rise above again)
  // re-triggers it.
  // Appends a new open period to the event's surge history and flips the
  // live flags on — shared by the auto-trigger effect and the manual toggle
  // so every activation, however it happens, ends up in `surgeLog` for the
  // after-event logs and the summary's availability graph.
  function withSurgeStarted(current: Event, startedAt: number): Partial<Event> {
    return {
      manualSurgeActive: true,
      manualSurgeStartedAt: startedAt,
      surgeLog: [...(current.surgeLog || []), { startedAt }],
    };
  }

  // Closes the currently-open surge period (if any) and flips the live flags off.
  function withSurgeEnded(current: Event, endedAt: number): Partial<Event> {
    const log = current.surgeLog || [];
    const lastOpenIndex = log.length - 1;
    const closedLog =
      lastOpenIndex >= 0 && log[lastOpenIndex].endedAt === undefined
        ? log.map((period, i) => (i === lastOpenIndex ? { ...period, endedAt } : period))
        : log;
    return {
      manualSurgeActive: false,
      manualSurgeStartedAt: undefined,
      surgeLog: closedLog,
    };
  }

  const wasAboveSurgeThresholdRef = useRef(false);
  useEffect(() => {
    if (!event || isEventEnded(event)) return;
    const summary = getTeamAvailabilitySummary(event);
    const threshold = getSurgeLimitPercent(event);
    const aboveThreshold = isSurging(summary.percentOnCalls, threshold);

    if (aboveThreshold && !wasAboveSurgeThresholdRef.current && !event.manualSurgeActive) {
      // Functional form reads the transaction's live snapshot rather than this
      // closure's possibly-stale `event`, so a surge someone else just started
      // (or that this effect itself already started a moment ago) never gets
      // its start time clobbered by a second, redundant Date.now().
      updateEvent((current) =>
        current.manualSurgeActive ? {} : withSurgeStarted(current, Date.now())
      );
    }
    wasAboveSurgeThresholdRef.current = aboveThreshold;
  }, [event, updateEvent]);

  // Same auto-activation, for the combined calls+clinic pending-transport
  // count crossing its own configurable threshold.
  const wasPendingTransportAboveThresholdRef = useRef(false);
  useEffect(() => {
    if (!event || isEventEnded(event)) return;
    const aboveThreshold = pendingTransportCount >= getPendingTransportSurgeThreshold(event);

    if (aboveThreshold && !wasPendingTransportAboveThresholdRef.current && !event.manualSurgeActive) {
      updateEvent((current) =>
        current.manualSurgeActive ? {} : withSurgeStarted(current, Date.now())
      );
    }
    wasPendingTransportAboveThresholdRef.current = aboveThreshold;
  }, [event, pendingTransportCount, updateEvent]);

  // Same auto-activation again, for the unassigned-call-time threshold —
  // polls wall-clock time (rather than reacting to `event` changes) since
  // nothing about a Pending call's own data changes while it waits, same
  // reasoning as the toast alarm earlier in this file. Independent of the
  // Pending chip's own fixed 1-minute blink animation (PendingCallChip),
  // which always fires regardless of this configurable threshold.
  const wasUnassignedCallAboveThresholdRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      const currentEvent = eventRef.current;
      if (!currentEvent || isEventEnded(currentEvent)) return;
      const alarmMs = getUnassignedCallSurgeSeconds(currentEvent) * 1000;
      const aboveThreshold = (currentEvent.calls || []).some(c => {
        if (c.status !== 'Pending') return false;
        const createdAt = c.log?.[0]?.timestamp;
        return !!createdAt && Date.now() - createdAt >= alarmMs;
      });

      if (aboveThreshold && !wasUnassignedCallAboveThresholdRef.current && !currentEvent.manualSurgeActive) {
        updateEvent((current) =>
          current.manualSurgeActive ? {} : withSurgeStarted(current, Date.now())
        );
      }
      wasUnassignedCallAboveThresholdRef.current = aboveThreshold;
    }, 5000);
    return () => clearInterval(interval);
  }, [updateEvent]);

  // Keeps the mobile Clinic tab's selected clinic valid as `event.clinics`
  // is added to (new venue posts flagged as clinics) or the selection is
  // stale from a previous event.
  useEffect(() => {
    const currentClinics = getEventClinics(event?.clinics);
    if (!currentClinics.some(c => c.id === mobileSelectedClinicId)) {
      setMobileSelectedClinicId(currentClinics[0]?.id ?? '');
    }
  }, [event?.clinics, mobileSelectedClinicId]);

  // Return early if auth is not ready or user is not authenticated
  if (!isLiteMode && !ready) {
    return <LoadingScreen label="Loading…" />;
  }

  if (!isLiteMode && !user) {
    return (
      <div className="w-full bg-surface-deepest min-h-[calc(100vh-72px)] flex items-center justify-center">
        <div className="text-surface-light">Redirecting...</div>
      </div>
    );
  }

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    setOpenCallId(openCallId === id ? null : id);
  };

  // function getPostKey(post: Post): string {
  //   return typeof post === 'string' ? post : post.name;
  // }

  // Handler reserved for interactive map marker moves; keep defined for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTeamMarkerMove = async (teamName: string, newX: number, newY: number) => {
    if (!event) return;
    // Find the team's current post object
    const team = event.staff.find(t => t.team === teamName);
    if (!team) return;
    // Find the post object for the team's location
    const postIdx = event.eventPosts.findIndex(p => (typeof p === 'string' ? p : p.name) === team.location);
    if (postIdx === -1) return;

    // Update the post's coordinates
    const posts = [...event.eventPosts];
    if (typeof posts[postIdx] === 'object') {
      posts[postIdx] = { ...posts[postIdx], x: newX, y: newY };
    }

    await updateEvent({
      venue: {
        ...event.venue,
        posts,
      }
    });
  };

  // Handler reserved for interactive equipment marker moves; keep defined for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEquipmentMarkerMove = async (equipmentId: string, newX: number, newY: number) => {
    if (!event) return;
    
    // Find the equipment in eventEquipment array
    const equipment = event.eventEquipment?.find(eq => eq.id === equipmentId);
    if (!equipment) return;

    // Find the post object for equipment's current location
    const postIndex = event.eventPosts?.findIndex(p => 
      (typeof p === 'string' ? p : p.name) === equipment.location
    );
    
    if (postIndex === -1 || !event.eventPosts) {
      // No matching post found, equipment might not have a valid location
      console.warn(`No post found for equipment ${equipment.name} at location ${equipment.location}`);
      return;
    }

    // Update the post's coordinates
    const updatedPosts = [...event.eventPosts];
    if (typeof updatedPosts[postIndex] === 'object') {
      updatedPosts[postIndex] = { 
        ...updatedPosts[postIndex], 
        x: newX, 
        y: newY 
      };
    }

    // Save updated posts to the event
    await updateEvent({
      eventPosts: updatedPosts
    });
  };

  if (!event) return <LoadingScreen label="Loading event…" />;

  const resolvedCallStatuses = RESOLVED_CALL_STATUSES;

  // A call's "primary" team status, mirroring the same Transporting > On Scene
  // priority used for the table row tint (getRowStatusClass) so a call with
  // teams in more than one status isn't double-counted across insight tiles.
  const getCallPrimaryStatus = (call: Call): 'Pending' | 'Transporting' | 'On Scene' | 'Other' => {
    if (!Array.isArray(call.assignedTeam) || call.assignedTeam.length === 0) return 'Pending';
    const statuses = call.assignedTeam
      .map(team => event?.staff.find(s => s.team === team)?.status)
      .filter((status): status is string => status !== undefined);
    if (statuses.includes('Transporting')) return 'Transporting';
    if (statuses.includes('On Scene')) return 'On Scene';
    return 'Other';
  };

  // Venue-designated clinics, falling back to a single default "Clinic" for
  // events created before multi-clinic support existed.
  const clinics: Clinic[] = getEventClinics(event.clinics);
  const mobileClinicId = clinics.some(c => c.id === mobileSelectedClinicId) ? mobileSelectedClinicId : (clinics[0]?.id ?? '');

  // Layers shown on the Map tab: the venue's own multi-layer array when
  // present, falling back to a single synthetic layer built from the
  // venue's legacy single mapUrl/eventPosts for venues saved before layers
  // existed. Shared with the post-event summary page's zone breakdown via
  // getEventVenueLayers, so both resolve a call's zone(s) identically.
  const venueLayers: Layer[] = getEventVenueLayers(event);

  // TAK live tracking (optional): only TAK events get the map overlay, and
  // only builds with NEXT_PUBLIC_TAK=on contain it at all.
  const takOverlay: MapOverlay | undefined =
    process.env.NEXT_PUBLIC_TAK === 'on' && TakEventPanel && TakBasemapUnderlay && TakBasemapToolbar &&
    event.mapMode === 'tak' && !isLiteMode && user && eventId
      ? {
          // Team and supervisor markers sit at their live positions only (D66).
          unitTracking: unitTracking ?? { positions: {}, alignments: {} },
          underlay: (ctx) => (
            <Suspense fallback={null}>
              <TakBasemapUnderlay
                eventId={eventId}
                layer={ctx.layer}
                rect={ctx.rect}
                container={ctx.container}
                scale={ctx.scale}
                setImageOpacity={ctx.setImageOpacity}
              />
            </Suspense>
          ),
          toolbar: (ctx) => (
            <Suspense fallback={null}>
              <TakBasemapToolbar eventId={eventId} layer={ctx.layer} />
            </Suspense>
          ),
          chrome: (
            <Suspense fallback={null}>
              <TakEventPanel eventId={eventId} event={event} uid={user.uid} isOwner={event.userId === user.uid} layers={venueLayers} />
            </Suspense>
          ),
        }
      : undefined;

  // TAK background work (call state, auto-linking) for the whole page, not only the Map tab.
  const takAgent =
    process.env.NEXT_PUBLIC_TAK === 'on' && TakEventAgent && event.mapMode === 'tak' && !isLiteMode && user && eventId ? (
      <Suspense fallback={null}>
        <TakEventAgent eventId={eventId} event={event} uid={user.uid} onTracking={setUnitTracking} />
      </Suspense>
    ) : null;

  // The Map tab only makes sense once an image actually exists to show —
  // a venue with no map uploaded to any layer gets no tab, same rule the
  // navbar used for its old "Venue Map" shortcut.
  const hasVenueMapImage = venueLayers.some((layer) => !!layer.mapUrl || isGeoLayer(layer));

  // Every post name actually placeable on the map (has x/y coordinates) —
  // plain string posts and free-text locations (Roaming, In Clinic, a typed
  // custom value) have nowhere to be pinned, so a team/supervisor/equipment
  // card's "view on map" button is disabled unless its location is in here.
  const knownMapLocations = new Set(
    venueLayers.flatMap((layer) =>
      (layer.posts || []).filter((post) => isPlacedPost(post, layer)).map((post) => (typeof post === 'string' ? post : post.name))
    )
  );

  // Calls delivered before per-clinic routing existed (or with no clinicId set) all
  // land in the first/default clinic, so nothing gets silently hidden or duplicated.
  const getClinicCalls = (clinicId: string) => (event.calls || []).filter(
    call => call.status === 'Delivered' && (clinics.length <= 1 || (call.clinicId ?? clinics[0]?.id) === clinicId)
  );

  const getClinicInsightCounts = (clinicId: string) => {
    const calls = getClinicCalls(clinicId);
    return {
      totalPatients: calls.length,
      // Matches the tab label's count exactly: unresolved means no outcome set yet.
      totalInClinic: calls.filter(c => !c.outcome).length,
      totalTransported: calls.filter(c => c.outcome === 'Transported').length,
      totalPendingTransport: calls.filter(c => c.outcome === 'Pending Transport').length,
    };
  };

  // Dispatch zones, derived from the venue's dispatch-zone-flagged areas —
  // empty for events with none, unlike clinics there's no single-default
  // fallback since "All Calls" already covers every call.
  const dispatchZones: DispatchZone[] = getEventDispatchZones(event.dispatchZones);

  // A call belongs to a zone purely by geometry — whether its location's
  // post falls inside that zone's polygon on the venue map — never by a
  // manually assigned field, so redrawing a zone's shape re-routes existing
  // calls automatically instead of orphaning them.
  //
  // The Calls tab is scoped by `zoneIds`, the callZoneFilter selection
  // (still a Set even for a single zone, since the dropdown is multi-select)
  // — the 'all' sentinel means unfiltered, otherwise a call counts if it
  // falls in ANY of the selected zones.
  const getCallsForZoneSelection = (zoneIds: Set<string>) => {
    if (zoneIds.has('all')) return event.calls || [];
    return (event.calls || []).filter(call =>
      getCallZoneIds(call, venueLayers).some(id => zoneIds.has(id))
    );
  };

  const getActiveCallsForZoneSelection = (zoneIds: Set<string>) =>
    getCallsForZoneSelection(zoneIds).filter(call => !resolvedCallStatuses.includes(call.status));

  const getInsightCountsForZoneSelection = (zoneIds: Set<string>) => {
    const calls = getCallsForZoneSelection(zoneIds);
    const active = getActiveCallsForZoneSelection(zoneIds);
    return {
      total: calls.length,
      active: active.length,
      pending: active.filter(call => getCallPrimaryStatus(call) === 'Pending').length,
      onScene: active.filter(call => getCallPrimaryStatus(call) === 'On Scene').length,
      transporting: active.filter(call => getCallPrimaryStatus(call) === 'Transporting').length,
    };
  };

  // The label shown on the single Calls tab and in the zone-filter
  // dropdown's trigger — "All Calls" when unfiltered, the zone's own name
  // for exactly one selected zone, or a joined list for several.
  const callZoneFilterLabel = callZoneFilter.has('all')
    ? t('All Calls')
    : dispatchZones
        .filter(zone => callZoneFilter.has(zone.id))
        .map(zone => zone.name)
        .join(', ') || t('All Calls');

  // Shared by the desktop dropdown and the mobile Select — "All Calls" is
  // exclusive with every zone: picking it clears any zone selection,
  // picking a zone drops "All Calls" and multi-selects normally, and
  // clearing the last selected zone falls back to "All Calls" so the
  // filter can never end up selecting nothing. Returns true when "All
  // Calls" was the option just picked, so the desktop dropdown (which
  // otherwise stays open for repeated zone picks) knows to close itself.
  const applyCallZoneSelectionChange = (keys: 'all' | Iterable<React.Key>): boolean => {
    // The listbox's own "select all" (e.g. Ctrl+A) isn't exposed anywhere
    // in this menu's UI, but the type allows for it — treat it as if every
    // zone (not the "All Calls" sentinel) were picked individually.
    const newSelection = keys === 'all'
      ? new Set(dispatchZones.map(zone => zone.id))
      : new Set(Array.from(keys, String));
    const addedKeys = Array.from(newSelection).filter((key) => !callZoneFilter.has(key));

    if (addedKeys.includes('all')) {
      setCallZoneFilter(new Set(['all']));
      return true;
    }
    if (addedKeys.length > 0) {
      const base = callZoneFilter.has('all') ? new Set<string>() : new Set(callZoneFilter);
      addedKeys.forEach((key) => base.add(key));
      setCallZoneFilter(base);
      return false;
    }
    // Nothing added, only a zone removed — fall back to "All Calls" if
    // that emptied the selection.
    setCallZoneFilter(newSelection.size > 0 ? newSelection : new Set(['all']));
    return false;
  };

  const handleToggleSurge = async () => {
    if (event.manualSurgeActive) {
      if (!window.confirm(t('Are you sure you want to disable surge?'))) return;
      await updateEvent((current) =>
        current.manualSurgeActive ? withSurgeEnded(current, Date.now()) : {}
      );
    } else {
      if (!window.confirm(t('Are you sure you want to enable surge?'))) return;
      // Functional form: if a surge was already started (by the auto-trigger
      // effect or another dispatcher) between this click and the transaction
      // running, keep its original start time instead of overwriting it.
      await updateEvent((current) =>
        current.manualSurgeActive ? {} : withSurgeStarted(current, Date.now())
      );
    }
  };

  const handleDeleteCall = async (callId: string) => {
    if (!event) return;

    // Filter out the call to delete it
    const updatedCalls = event.calls.filter(call => call.id !== callId);

    await updateEvent({ calls: updatedCalls });
    setContextMenu(null);
  };

  // Props shared by the desktop sidebar and mobile tab copies of each list.
  const sharedTeamListProps = {
    event,
    callDisplayNumberMap,
    teamTimers,
    updateEvent,
    cardViewMode,
    hasVenueMap: hasVenueMapImage,
    knownMapLocations,
    unitTracking: event.mapMode === 'tak' ? unitTracking : null,
    onRefreshTeamPost: refreshTeamFromSchedule,
    onNewCall: (teamName: string) => openAddCallModal({ assignedTeam: teamName }),
  };
  const teamListProps: TeamListProps = {
    ...sharedTeamListProps,
    sortMode: teamSortMode,
    onStatusChange: handleStatusChange,
    onLocationChange: handleLocationChange,
    onEditTeam: handleEditTeam,
    onDeleteTeam: handleDeleteTeam,
    onViewOnMap: viewTeamOnMap,
    // On a TAK event with a posting schedule, each team's posts are listed and edited in its card (D66).
    onPostAssignment: event.mapMode === 'tak' && (event.postingTimes || []).length > 0 ? handlePostAssignment : undefined,
  };
  const supervisorListProps: SupervisorListProps = {
    ...sharedTeamListProps,
    onStatusChange: handleSupervisorStatusChange,
    onLocationChange: handleSupervisorLocationChange,
    onEditSupervisor: handleEditSupervisor,
    onDeleteSupervisor: handleDeleteSupervisor,
    onViewOnMap: viewSupervisorOnMap,
  };
  const equipmentListProps: EquipmentListProps = {
    event,
    items: getEquipmentItems(),
    updateEvent,
    hasVenueMap: hasVenueMapImage,
    knownMapLocations,
    onStatusChange: handleEquipmentStatusChange,
    onLocationChange: handleEquipmentLocationChange,
    onMarkReady: handleEquipmentMarkReady,
    onDelete: handleEquipmentDelete,
    onViewOnMap: viewEquipmentOnMap,
  };

  // Plain render function (not a component) so the toolbar keeps its
  // identity across renders — see dispatchcontrols.tsx.
  const renderTeamActions = (selectedTab: LeftPanelTab) => (
    <TeamActionButtonGroup
      selectedTab={selectedTab}
      onAddTeam={handleAddNewTeam}
      onAddSupervisor={handleAddNewSupervisor}
      onAddEquipment={handleAddNewEquipment}
      onRefreshPosts={refreshAllPostsFromSchedule}
      hasPostingTimes={(event.postingTimes?.length ?? 0) > 0}
      cardViewMode={cardViewMode}
      onCardViewModeChange={setCardViewMode}
      teamSortMode={teamSortMode}
      onTeamSortModeChange={setTeamSortMode}
    />
  );

  // Rendered once, above the mobile <Tabs>, inside the same sticky container
  // as AvailabilitySurgeStrip — sharing one sticky box with the availability
  // strip means there's no gap between them for scrolling cards to peek
  // through, unlike two independently-offset sticky elements would have.
  const renderMobileTabHeader = () => {
    if (mobileActiveTab === 'teams') {
      return (
        <>
          <Select
            selectedKeys={[mobileTeamsSubTab]}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as 'teams' | 'supervisors';
              if (selected) setMobileTeamsSubTab(selected);
            }}
            aria-label="Select teams or supervisors"
            className="w-auto min-w-[160px]"
            classNames={{
              trigger: "bg-surface-deep border border-surface-liner rounded-lg hover:bg-surface-liner h-10 min-h-10",
              value: "text-surface-light",
              popoverContent: "bg-surface-deep border-surface-liner",
            }}
          >
            <SelectItem key="teams">{t('Teams')}</SelectItem>
            <SelectItem key="supervisors">{t('Supervisors')}</SelectItem>
          </Select>
          {renderTeamActions(mobileTeamsSubTab)}
        </>
      );
    }
    if (mobileActiveTab === 'equipment') {
      return (
        <>
          <h2 className="text-xl font-bold text-surface-light">{t('Equipment')}</h2>
          {renderTeamActions('equipment')}
        </>
      );
    }
    if (mobileActiveTab === 'calls') {
      return (
        <>
          {dispatchZones.length > 1 ? (
            <Select
              selectedKeys={callZoneFilter}
              selectionMode="multiple"
              onSelectionChange={(keys) => applyCallZoneSelectionChange(keys)}
              aria-label={t('Filter by zone')}
              className="w-auto min-w-[160px]"
              classNames={{
                trigger: "bg-surface-deep border border-surface-liner rounded-lg hover:bg-surface-liner h-10 min-h-10",
                value: "text-surface-light",
                popoverContent: "bg-surface-deep border-surface-liner",
              }}
            >
              <SelectItem key="all" className={callZoneFilter.has('all') ? 'font-semibold' : ''}>
                {t('All Calls')}
              </SelectItem>
              <>
                {dispatchZones.map((zone) => (
                  <SelectItem key={zone.id} className={callZoneFilter.has('all') ? 'opacity-50' : ''}>
                    {zone.name}
                  </SelectItem>
                ))}
              </>
            </Select>
          ) : (
            <h2 className="text-xl font-bold text-surface-light">{t('Calls')}</h2>
          )}
          <div className="flex items-center gap-1.5">
            <CallSortButton large sortMode={callSortMode} onSortModeChange={setCallSortMode} />
            <Tooltip content={t('Add Call')} placement="top">
              {/* Same pill treatment as TeamActionButtonGroup (p-1 + a
                  transparent inner button) so this single-button header
                  matches that triple-button one in total height. */}
              <div className="p-1 rounded-full bg-surface-deep border border-surface-liner">
                <Button
                  size="sm"
                  variant="flat"
                  className="rounded-full bg-transparent hover:bg-surface-liner text-base"
                  aria-label={t('Add Call')}
                  onPress={() => openAddCallModal()}
                >
                  {t('Add Call')}
                </Button>
              </div>
            </Tooltip>
          </div>
        </>
      );
    }
    if (mobileActiveTab === 'clinic') {
      return (
        <>
          {clinics.length > 1 ? (
            <Select
              selectedKeys={mobileClinicId ? [mobileClinicId] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) setMobileSelectedClinicId(selected);
              }}
              aria-label="Select clinic"
              className="w-auto min-w-[160px]"
              classNames={{
                trigger: "bg-surface-deep border border-surface-liner rounded-lg hover:bg-surface-liner h-10 min-h-10",
                value: "text-surface-light",
                popoverContent: "bg-surface-deep border-surface-liner",
              }}
            >
              {clinics.map((clinic) => (
                <SelectItem key={clinic.id}>{clinic.name}</SelectItem>
              ))}
            </Select>
          ) : (
            <h2 className="text-xl font-bold text-surface-light">{clinics[0]?.name ?? t('Clinic')}</h2>
          )}
          <Tooltip content={t('Add Patient')} placement="top">
            {/* Same pill treatment as TeamActionButtonGroup (p-1 + a
                transparent inner button) so this single-button header
                matches that triple-button one in total height. */}
            <div className="p-1 rounded-full bg-surface-deep border border-surface-liner">
              <Button
                size="sm"
                variant="flat"
                className="rounded-full bg-transparent hover:bg-surface-liner text-base"
                aria-label={t('Add patient (mobile)')}
                onPress={() => setShowQuickClinicCallForm(true)}
              >
                {t('Add Patient')}
              </Button>
            </div>
          </Tooltip>
        </>
      );
    }
    return null;
  };

  const renderMobileCallCard = (call: Call) => (
    <CallTrackingCard
      key={call.id}
      call={call}
      callDisplayNumber={callDisplayNumberMap.get(call.id) || 0}
      event={event}
      onLocationChange={async (callId, newLocation) => {
        const callToUpdate = event.calls.find(c => c.id === callId);
        if (!callToUpdate) return;

        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
        const updatedCall = {
          ...callToUpdate,
          location: newLocation,
          log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Location changed to ${newLocation}.` }]
        };
        const updatedCalls = event.calls.map(c => c.id === callId ? updatedCall : c);
        await updateEvent({ calls: updatedCalls });
      }}
      onAgeSexChange={async (callId, ageSexValue) => {
        const callToUpdate = event.calls.find(c => c.id === callId);
        if (!callToUpdate) return;

        const { age, gender } = parseAgeSex(ageSexValue);
        const newAge = age || '';
        const newGender = gender || '';

        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
        const updatedCall = {
          ...callToUpdate,
          age: newAge,
          gender: newGender,
          log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Age/Sex set to ${formatAgeSex(newAge, newGender) || 'N/A'}.` }]
        };
        const updatedCalls = event.calls.map(c => c.id === callId ? updatedCall : c);
        await updateEvent({ calls: updatedCalls });
      }}
      onChiefComplaintChange={async (callId, newChiefComplaint) => {
        const callToUpdate = event.calls.find(c => c.id === callId);
        if (!callToUpdate) return;

        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
        const updatedCall = {
          ...callToUpdate,
          chiefComplaint: newChiefComplaint,
          log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Chief Complaint changed to ${newChiefComplaint}.` }]
        };
        const updatedCalls = event.calls.map(c => c.id === callId ? updatedCall : c);
        await updateEvent({ calls: updatedCalls });
      }}
      onRemoveTeamFromCall={handleRemoveTeamFromCall}
      onAddTeamToCall={handleAddTeamToCall}
      handleTeamStatusChange={handleTeamStatusChange}
      onTransportToAmbulance={openCallTransportUnitModal}
      handleRevertDetachment={handleRevertDetachment}
      handleMarkDuplicate={handleMarkDuplicate}
      handleTogglePriority={handleTogglePriorityFromMenu}
      handleTogglePin={handleTogglePin}
      handleDeleteCall={handleDeleteCall}
      formatAgeSex={formatAgeSex}
      teamStatusMap={teamStatusMap}
      updateEvent={updateEvent}
    />
  );

  const renderMobileClinicCard = (call: Call) => (
    <ClinicTrackingCard
      key={call.id}
      call={call}
      callDisplayNumber={callDisplayNumberMap.get(call.id) || 0}
      event={event}
      onLocationChange={async (callId, newLocation) => {
        const callToUpdate = event.calls.find(c => c.id === callId);
        if (!callToUpdate) return;

        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
        const updatedCall = {
          ...callToUpdate,
          location: newLocation,
          log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Location changed to ${newLocation}.` }]
        };
        const updatedCalls = event.calls.map(c => c.id === callId ? updatedCall : c);
        await updateEvent({ calls: updatedCalls });
      }}
      onAgeSexChange={async (callId, ageSexValue) => {
        const callToUpdate = event.calls.find(c => c.id === callId);
        if (!callToUpdate) return;

        const { age, gender } = parseAgeSex(ageSexValue);
        const newAge = age || '';
        const newGender = gender || '';

        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
        const updatedCall = {
          ...callToUpdate,
          age: newAge,
          gender: newGender,
          log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Age/Sex set to ${formatAgeSex(newAge, newGender) || 'N/A'}.` }]
        };
        const updatedCalls = event.calls.map(c => c.id === callId ? updatedCall : c);
        await updateEvent({ calls: updatedCalls });
      }}
      onChiefComplaintChange={async (callId, newChiefComplaint) => {
        const callToUpdate = event.calls.find(c => c.id === callId);
        if (!callToUpdate) return;

        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
        const updatedCall = {
          ...callToUpdate,
          chiefComplaint: newChiefComplaint,
          log: [...(callToUpdate.log || []), { timestamp: now.getTime(), message: `${hhmm} - Chief Complaint changed to ${newChiefComplaint}.` }]
        };
        const updatedCalls = event.calls.map(c => c.id === callId ? updatedCall : c);
        await updateEvent({ calls: updatedCalls });
      }}
      onOutcomeChange={handleClinicOutcomeChange}
      onRevertOutcome={handleRevertClinicOutcome}
      handleDeleteCall={handleDeleteCall}
      handleTogglePin={handleTogglePin}
      formatAgeSex={formatAgeSex}
      updateEvent={updateEvent}
    />
  );

  return (
    <DispatchVocabularyProvider terms={vocabularyTerms}>
      {takAgent}
      <ToastContainer
        theme="dark"
        toastClassName="!bg-surface-deep !border !border-surface-liner !rounded-2xl !text-surface-light !shadow-lg"
        progressClassName="!bg-accent"
      />
      {/* All your modals first - unchanged */}
      <QuickCallModal
        isOpen={showQuickCallForm}
        onClose={() => setShowQuickCallForm(false)}
        event={event}
        updateEvent={updateEvent}
        quickCall={quickCall}
        setQuickCall={setQuickCall}
        formatAgeSex={formatAgeSex}
        parseAgeSex={parseAgeSex}
        quickCallRef={quickCallRef}
      />
      <ClinicWalkupModal
        isOpen={showQuickClinicCallForm}
        onClose={() => setShowQuickClinicCallForm(false)}
        event={event}
        updateEvent={updateEvent}
        clinicCall={clinicCall}
        setClinicCall={setClinicCall}
        formatAgeSex={formatAgeSex}
        parseAgeSex={parseAgeSex}
        clinicId={isMobile ? mobileClinicId : (clinics.find(c => c.id === selectedRightTab)?.id || clinics[0]?.id)}
      />
      <TransportUnitModal
        isOpen={showTransportUnitModal}
        onClose={() => {
          setShowTransportUnitModal(false);
          setTransportUnitCallId(null);
          setTransportUnitValue('');
        }}
        onSubmit={handleSubmitTransportUnit}
        value={transportUnitValue}
        onValueChange={setTransportUnitValue}
      />
      <TransportUnitModal
        isOpen={showCallTransportUnitModal}
        onClose={() => {
          setShowCallTransportUnitModal(false);
          setCallTransportUnitCallId(null);
          setCallTransportUnitTeam(null);
          setCallTransportUnitValue('');
        }}
        onSubmit={handleSubmitCallTransportUnit}
        value={callTransportUnitValue}
        onValueChange={setCallTransportUnitValue}
      />
      <AddTeamModal
        isOpen={showAddTeamModal}
        onClose={() => setShowAddTeamModal(false)}
        mode="create"
        existingTeamNames={allTeamNames}
        onSave={(team) => handleSaveNewTeam(team)}
        roles={LICENSES.map(name => ({ name, fullName: name }))}
      />
      <AddTeamModal
        isOpen={showEditTeamModal}
        onClose={() => {
          setShowEditTeamModal(false);
          setEditTeamOriginalName(null);
        }}
        mode="edit"
        submitLabelOverride="Save Changes"
        existingTeamNames={teamNamesExcludingEdited}
        initialTeam={editingTeam}
        onSave={(team) => handleSaveEditedTeam(team)}
        roles={LICENSES.map(name => ({ name, fullName: name }))}
      />
      <AddSupervisorModal
        isOpen={showAddSupervisorModal}
        onClose={() => setShowAddSupervisorModal(false)}
        mode="create"
        onSubmit={handleSaveNewSupervisor}
        teamName={teamName}
        setTeamName={setTeamName}
        memberName={memberName}
        setMemberName={setMemberName}
        memberCert={memberCert}
        setMemberCert={setMemberCert}
        roles={LICENSES.map(name => ({ name, fullName: name }))}
      />
      <AddSupervisorModal
        isOpen={showEditSupervisorModal}
        onClose={() => setShowEditSupervisorModal(false)}
        mode="edit"
        onSubmit={handleSaveEditedSupervisor}
        teamName={teamName}
        setTeamName={setTeamName}
        memberName={memberName}
        setMemberName={setMemberName}
        memberCert={memberCert}
        setMemberCert={setMemberCert}
        roles={LICENSES.map(name => ({ name, fullName: name }))}
      />
      <AddEquipmentModal
        isOpen={showAddEquipmentModal}
        onClose={() => setShowAddEquipmentModal(false)}
        onSubmit={(name, location) => handleAddTemporaryEquipment(name, location)}
        locations={(event?.venue?.posts || []).map(p => (typeof p === 'string' ? p : p.name))}
      />
      <DebugModal
        isOpen={showDebugModal}
        onClose={() => setShowDebugModal(false)}
        onPopulate={handlePopulateTestData}
        onReset={handleResetAllStatuses}
        onClear={handleNuclearClear}
        event={event}
      />
      {/* Main Layout */}
      <div className="relative w-full bg-surface-deepest h-[calc(100vh-72px)]">
        {eventEnded && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-neutral-700/70 text-center px-6">
            <p className="text-xl font-semibold text-surface-light">{t('This event has ended')}</p>
            <p className="text-sm text-surface-light/80 max-w-sm">
              {t('Data collection is locked. Go to the Event Summary for a read-only record.')}
            </p>
            <Button onPress={goToSummary} className="mt-1 bg-accent hover:bg-accent/90 text-surface-light">
              {t('Go to Event Summary')}
            </Button>
          </div>
        )}
        <div className="max-w-[1750px] mx-auto px-2 sm:px-4 h-full">

          {isAdmin && (
            <button 
              onClick={() => setShowDebugModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/50 rounded hover:bg-red-500 hover:text-surface-light transition-all text-sm font-bold"
            >
              <ShieldAlert className="w-4 h-4" />
              Debug View
            </button>
          )}
          
          {/* Desktop Layout - Left Sidebar with Select, Right Side with Calls & Clinic */}
          <div className="hidden lg:block h-full">
            <ResizablePanelGroup direction="horizontal" className="gap-2 h-full">
              
              {/* LEFT SIDEBAR - Select for Teams/Supervisors/Equipment */}
              <ResizablePanel defaultSize={25} minSize={20} maxSize={37}>
                <div className="h-full rounded-xl flex flex-col">
                  {/* Header with Select and Action Buttons */}
                  <div className="flex w-full justify-between items-center pt-2 pb-2 border-b border-surface-liner shrink-0">
                    <Select
                      selectedKeys={[selectedLeftTab]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setSelectedLeftTab(selected);
                      }}
                      aria-label="Select section"
                      className="w-auto min-w-[180px]"
                      classNames={{
                        trigger: "bg-surface-deep border border-surface-liner rounded-full hover:bg-surface-liner h-10 min-h-10",
                        value: "text-surface-light",
                        popoverContent: "bg-surface-deep border-surface-liner",
                      }}
                    >
                      <SelectItem key="teams">{t('Teams')}</SelectItem>
                      <SelectItem key="supervisors">{t('Supervisors')}</SelectItem>
                      <SelectItem key="equipment">{t('Equipment')}</SelectItem>
                    </Select>

                    {renderTeamActions(selectedLeftTab as LeftPanelTab)}
                  </div>

                  {event && <div className="shrink-0"><AvailabilitySurgeStrip event={event} /></div>}

                  {/* Content with ScrollShadow */}
                  <div className="flex-1 min-h-0 overflow-auto scrollbar-hide">
                    <div className="p-0 pb-16">

                      {/* TEAMS CONTENT */}
                      {selectedLeftTab === 'teams' && (
                        <TeamList {...teamListProps} emptyText={t('No teams available')} />
                      )}

                      {/* SUPERVISORS CONTENT */}
                      {selectedLeftTab === 'supervisors' && (
                        <SupervisorList {...supervisorListProps} emptyText="No supervisors assigned" />
                      )}

                      {/* EQUIPMENT CONTENT */}
                      {selectedLeftTab === 'equipment' && (
                        <EquipmentList {...equipmentListProps} emptyText={t('No equipment configured')} />
                      )}

                    </div>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* RIGHT SIDE - Calls and Clinic Tabs */}
              <ResizablePanel defaultSize={75} minSize={50}>
                <div className="h-full flex flex-col overflow-hidden pt-2 pb-2">
                  <div className="w-full flex flex-col flex-1 min-h-0">
                    <div className="relative z-30 mx-1.5 pb-0 flex items-start justify-between gap-1 h-10 shrink-0">
                      <div className="flex items-end gap-1 min-w-0">
                        <PanelTab active={selectedRightTab === 'calls'} onSelect={() => setSelectedRightTab('calls')}>
                          {dispatchZones.length > 0 ? callZoneFilterLabel : t('Calls')} ({getActiveCallsForZoneSelection(callZoneFilter).length})
                        </PanelTab>

                        {clinics.map((clinic) => (
                          <PanelTab
                            key={clinic.id}
                            active={selectedRightTab === clinic.id}
                            onSelect={() => setSelectedRightTab(clinic.id)}
                          >
                            {clinic.name} ({getClinicCalls(clinic.id).filter(c => !c.outcome).length})
                          </PanelTab>
                        ))}

                        {hasVenueMapImage && (
                          <Tooltip content={`${t('Map')} (Alt+M)`} placement="top">
                            <PanelTab
                              active={selectedRightTab === 'map'}
                              onSelect={() => setSelectedRightTab('map')}
                              aria-label={t('Map')}
                            >
                              <MapIcon className="h-4 w-4" />
                            </PanelTab>
                          </Tooltip>
                        )}
                      </div>

                      <SurgeToggleButton
                        active={!!event.manualSurgeActive}
                        startedAt={event.manualSurgeStartedAt}
                        onToggle={handleToggleSurge}
                      />
                    </div>

                    {selectedRightTab === 'calls' && !isMobile && (() => {
                      const zoneCounts = getInsightCountsForZoneSelection(callZoneFilter);
                      const isAllCalls = callZoneFilter.has('all');
                      return (
                      <div className="relative z-10 -mt-px mx-1.5 rounded-lg bg-surface-deep px-2.5 py-2 flex flex-col flex-1 min-h-0">
                        <div className="shrink-0 flex flex-col gap-2 pb-1">
                          <div className="flex items-center justify-between py-1">
                            <TrackingInsightsRow
                              items={[
                                { key: 'total', label: t('Total Calls Logged'), count: zoneCounts.total },
                                { key: 'active', label: t('Active'), count: zoneCounts.active },
                                { key: 'pending', label: t('Pending'), count: zoneCounts.pending, colorClass: 'text-surface-light' },
                                { key: 'onScene', label: t('On Scene'), count: zoneCounts.onScene, colorClass: 'text-status-red' },
                                { key: 'transporting', label: t('Transporting'), count: zoneCounts.transporting, colorClass: 'text-status-red' },
                              ]}
                            />
                            <div className="flex items-center gap-1.5">
                              {dispatchZones.length > 1 && (
                                <CallZoneFilterButton
                                  label={callZoneFilterLabel}
                                  zones={dispatchZones}
                                  selection={callZoneFilter}
                                  onSelectionChange={applyCallZoneSelectionChange}
                                />
                              )}
                              <CallSortButton sortMode={callSortMode} onSortModeChange={setCallSortMode} />
                              <Tooltip content={`${t('Add Call')} (Ctrl+Enter)`} placement="top">
                                <div>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    className="rounded-full bg-surface-deep border border-surface-liner hover:bg-surface-liner"
                                    aria-label={t('Add Call')}
                                    data-testid="add-call-button"
                                    onPress={() => openAddCallModal()}
                                  >
                                    {t('Add Call')}
                                  </Button>
                                </div>
                              </Tooltip>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 min-h-0">
                          <CallTrackingTable
                            event={event}
                            filterCalls={isAllCalls ? undefined : (call) => getCallZoneIds(call, venueLayers).some(id => callZoneFilter.has(id))}
                            callDisplayNumberMap={callDisplayNumberMap}
                            showResolvedCalls={showResolvedCalls}
                            setShowResolvedCalls={setShowResolvedCalls}
                            openCallId={openCallId}
                            setOpenCallId={setOpenCallId}
                            editingCell={editingCell}
                            setEditingCell={setEditingCell}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            teamStatusMap={teamStatusMap}
                            updateEvent={updateEvent}
                            handleCellClick={handleCellClick}
                            handleCellBlur={handleCellBlur}
                            handleAgeSexBlur={handleAgeSexBlur}
                            handleRowClick={handleRowClick}
                            handleMarkDuplicate={handleMarkDuplicate}
                            handleTogglePriorityFromMenu={handleTogglePriorityFromMenu}
                            handleTogglePin={handleTogglePin}
                            sortMode={callSortMode}
                            handleDeleteCall={handleDeleteCall}
                            handleTeamStatusChange={handleTeamStatusChange}
                            onTransportToAmbulance={openCallTransportUnitModal}
                            handleRemoveTeamFromCall={handleRemoveTeamFromCall}
                            handleAddTeamToCall={handleAddTeamToCall}
                            handleRevertDetachment={handleRevertDetachment}
                            formatAgeSex={formatAgeSex}
                          />
                        </div>
                      </div>
                      );
                    })()}

                    {clinics.map((clinic) => selectedRightTab === clinic.id && !isMobile && (
                      <div key={clinic.id} className="relative z-10 -mt-px mx-1.5 rounded-lg bg-surface-deep px-2.5 py-2 flex flex-col flex-1 min-h-0">
                        <div className="shrink-0 flex flex-col gap-2 pb-1">
                          <div className="flex items-center justify-between py-1">
                            {(() => {
                              const clinicCounts = getClinicInsightCounts(clinic.id);
                              return (
                                <TrackingInsightsRow
                                  items={[
                                    { key: 'total', label: t('Total Patients'), count: clinicCounts.totalPatients },
                                    { key: 'inClinic', label: t('In Clinic'), count: clinicCounts.totalInClinic, colorClass: 'text-status-blue' },
                                    { key: 'transported', label: t('Transported'), count: clinicCounts.totalTransported, colorClass: 'text-status-green' },
                                    { key: 'pendingTransport', label: t('Pending Transport'), count: clinicCounts.totalPendingTransport, colorClass: 'text-status-orange' },
                                  ]}
                                />
                              );
                            })()}
                            <Tooltip content={t('Add Patient')} placement="top">
                              <div>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  className="rounded-full bg-surface-deep border border-surface-liner hover:bg-surface-liner"
                                  aria-label={t('Add Patient')}
                                  onPress={() => setShowQuickClinicCallForm(true)}
                                >
                                  {t('Add Patient')}
                                </Button>
                              </div>
                            </Tooltip>
                          </div>
                        </div>

                        <div className="flex-1 min-h-0">
                          <ClinicTrackingTable
                            event={event}
                            clinicId={clinic.id}
                            clinics={clinics}
                            callDisplayNumberMap={callDisplayNumberMap}
                            showResolvedClinicCalls={showResolvedClinicCalls}
                            setShowResolvedClinicCalls={setShowResolvedClinicCalls}
                            openClinicCallId={openClinicCallId}
                            setOpenClinicCallId={setOpenClinicCallId}
                            editingCell={editingCell}
                            setEditingCell={setEditingCell}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            updateEvent={updateEvent}
                            handleCellClick={handleCellClick}
                            handleCellBlur={handleCellBlur}
                            handleAgeSexBlur={handleAgeSexBlur}
                            onOutcomeChange={handleClinicOutcomeChange}
                            onRevertOutcome={handleRevertClinicOutcome}
                            handleTogglePin={handleTogglePin}
                            getCallRowClass={getCallRowClass}
                            formatAgeSex={formatAgeSex}
                          />
                        </div>
                      </div>
                    ))}

                    {selectedRightTab === 'map' && !isMobile && hasVenueMapImage && (
                      <div className="relative z-10 -mt-px mx-1.5 rounded-lg bg-surface-deep px-2.5 py-2 flex flex-col flex-1 min-h-0">
                        <VenueMapTab
                          layers={venueLayers}
                          staff={event.staff || []}
                          supervisor={event.supervisor || []}
                          equipment={event.eventEquipment || []}
                          teamTimers={teamTimers}
                          calls={event.calls || []}
                          clinics={clinics}
                          onAddCallAtPost={(location) => openAddCallModal({ location })}
                          onAddCallForTeam={(assignedTeam) => openAddCallModal({ assignedTeam })}
                          focusTeamRequest={mapTeamFocusRequest}
                          focusSupervisorRequest={mapSupervisorFocusRequest}
                          focusEquipmentRequest={mapEquipmentFocusRequest}
                          onTeamFocusHandled={() => setMapTeamFocusRequest(null)}
                          onSupervisorFocusHandled={() => setMapSupervisorFocusRequest(null)}
                          onEquipmentFocusHandled={() => setMapEquipmentFocusRequest(null)}
                          overlay={takOverlay}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* Mobile/Tablet Layout - Bottom Tabs */}
          <div className="lg:hidden">
            <div className="sticky top-14 z-40 bg-surface-deepest">
              {event && <AvailabilitySurgeStrip event={event} />}
              {mobileActiveTab !== 'map' && (
                <div className="flex justify-between items-center py-2">
                  {renderMobileTabHeader()}
                </div>
              )}
            </div>
            <Tabs
              aria-label="Dispatch sections"
              placement="bottom"
              radius="none"
              selectedKey={mobileActiveTab}
              onSelectionChange={(key) => setMobileActiveTab(String(key))}
              classNames={{
                base: "w-full",
                tabList: "fixed bottom-0 left-0 right-0 w-full rounded-none bg-surface-deep border-t border-surface-light/10 z-50 gap-0",
                cursor: "rounded-none bg-surface-liner",
                tab: "h-16 rounded-none",
                tabContent: "text-surface-light group-data-[selected=true]:text-surface-light",
                panel: "pt-0"
              }}
            >
              {/* TEAMS TAB */}
              <Tab key="teams" title={<Users className="h-6 w-6" />} aria-label={t('Teams')}>
                <div className="space-y-6 pb-20">
                  <div>
                    {mobileTeamsSubTab === 'teams' && (
                    <div className={cardViewMode === 'condensed' ? 'space-y-1.5' : 'space-y-3'}>
                      <TeamList {...teamListProps} emptyText={t('No teams added yet')} />
                    </div>
                    )}
                  </div>

                  {mobileTeamsSubTab === 'supervisors' && (
                    <SupervisorList {...supervisorListProps} emptyText={t('No supervisors added yet')} />
                  )}
                </div>
              </Tab>

              {/* EQUIPMENT TAB */}
              <Tab key="equipment" title={<BriefcaseMedical className="h-6 w-6" />} aria-label={t('Equipment')}>
                <div className="space-y-6 pb-20">
                  <div>
                    <div className="space-y-3">
                      <EquipmentList {...equipmentListProps} emptyText={t('No equipment configured')} />
                    </div>
                  </div>
                </div>
              </Tab>

              <Tab key="calls" title={<FaWalkieTalkie className="h-5 w-5" />} aria-label={t('Calls')}>
                <div className="space-y-6 pb-20">
                  <div>
                    {(() => {
                      const mobileZoneFilter = callZoneFilter.has('all')
                        ? undefined
                        : (call: Call) => getCallZoneIds(call, venueLayers).some(id => callZoneFilter.has(id));
                      const activeMobileCalls = sortActiveCalls(
                        event.calls
                          .filter((call: Call) => !['Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled', 'Resolved', 'Unable to Locate'].includes(call.status))
                          .filter((call: Call) => !mobileZoneFilter || mobileZoneFilter(call)),
                        callSortMode
                      );
                      const resolvedMobileCalls = event.calls
                        .filter((c: Call) => ['Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled', 'Resolved', 'Unable to Locate'].includes(c.status))
                        .filter((call: Call) => !mobileZoneFilter || mobileZoneFilter(call))
                        .sort((a: Call, b: Call) => parseInt(a.id) - parseInt(b.id));
                      return (
                        <>
                          <div className="dispatch-shell-list">
                            {isMobile && activeMobileCalls.map(renderMobileCallCard)}
                            {(!event.calls || event.calls.length === 0) && (
                              <div className="text-center text-surface-light/50 py-8">
                                {t('No calls')}
                              </div>
                            )}
                          </div>
                          <DispatchMotionCell isOpen={showResolvedCalls} animate>
                            {/* Manual top border (rather than the shared .dispatch-shell-list
                                adjacent-sibling CSS) since this list is a separate DOM subtree
                                from the active list above, so the sibling-based divider rule
                                can't bridge the seam between the last active and first
                                resolved card. */}
                            <div className={`dispatch-shell-list ${activeMobileCalls.length > 0 ? 'border-t border-surface-liner/60' : ''}`}>
                              {isMobile && resolvedMobileCalls.map(renderMobileCallCard)}
                            </div>
                          </DispatchMotionCell>
                        </>
                      );
                    })()}
                    <div className="flex justify-center pt-3">
                      <button
                        onClick={() => setShowResolvedCalls(prev => !prev)}
                        className="text-surface-faint text-base hover:text-surface-light"
                        aria-label="Toggle resolved calls"
                      >                        {showResolvedCalls ? t('Hide Resolved Calls') : t('Show Resolved Calls')}
                      </button>
                    </div>
                  </div>
                </div>
              </Tab>

              {/* CLINIC TAB - single tab, switch clinic via the dropdown when multiple are configured */}
              <Tab key="clinic" title={<HousePlus className="h-6 w-6" />} aria-label={t('Clinic')}>
                <div className="space-y-6 pb-20">
                  <div>
                    {(() => {
                      const activeMobileClinicCalls = sortActiveCalls(
                        (event.calls || [])
                          .filter(c => c.status === 'Delivered' && !isClinicCallResolved(c) && (clinics.length <= 1 || (c.clinicId ?? clinics[0]?.id) === mobileClinicId)),
                        'oldest'
                      );
                      const resolvedMobileClinicCalls = (event.calls || [])
                        .filter(c => isClinicCallResolved(c) && (clinics.length <= 1 || (c.clinicId ?? clinics[0]?.id) === mobileClinicId))
                        .sort((a, b) => parseInt(a.id) - parseInt(b.id));
                      return (
                        <>
                          <div className="dispatch-shell-list">
                            {isMobile && activeMobileClinicCalls.map(renderMobileClinicCard)}
                            {getClinicCalls(mobileClinicId).length === 0 && (
                              <div className="text-center text-surface-light/50 py-8">
                                {t('No clinic calls')}
                              </div>
                            )}
                          </div>
                          <DispatchMotionCell isOpen={showResolvedClinicCalls} animate>
                            {/* See the Calls tab's identical comment: manual border since this
                                is a separate DOM subtree from the active list above. */}
                            <div className={`dispatch-shell-list ${activeMobileClinicCalls.length > 0 ? 'border-t border-surface-liner/60' : ''}`}>
                              {isMobile && resolvedMobileClinicCalls.map(renderMobileClinicCard)}
                            </div>
                          </DispatchMotionCell>
                        </>
                      );
                    })()}
                    <div className="flex justify-center pt-3">
                      <button
                        onClick={() => setShowResolvedClinicCalls(prev => !prev)}
                        className="text-surface-faint text-base hover:text-surface-light"
                        aria-label="Toggle resolved clinic calls"
                      >
                        {showResolvedClinicCalls ? t('Hide Resolved Clinic Calls') : t('Show Resolved Clinic Calls')}
                      </button>
                    </div>
                  </div>
                </div>
              </Tab>

              {hasVenueMapImage && (
                <Tab key="map" title={<MapIcon className="h-6 w-6" />} aria-label={t('Map')}>
                  <div className="h-[70vh] pt-3 pb-20">
                    <VenueMapTab
                      layers={venueLayers}
                      staff={event.staff || []}
                      supervisor={event.supervisor || []}
                      equipment={event.eventEquipment || []}
                      teamTimers={teamTimers}
                      calls={event.calls || []}
                      clinics={clinics}
                      onAddCallAtPost={(location) => openAddCallModal({ location })}
                      onAddCallForTeam={(assignedTeam) => openAddCallModal({ assignedTeam })}
                      focusTeamRequest={mapTeamFocusRequest}
                      focusSupervisorRequest={mapSupervisorFocusRequest}
                      focusEquipmentRequest={mapEquipmentFocusRequest}
                      onTeamFocusHandled={() => setMapTeamFocusRequest(null)}
                      onSupervisorFocusHandled={() => setMapSupervisorFocusRequest(null)}
                      onEquipmentFocusHandled={() => setMapEquipmentFocusRequest(null)}
                      overlay={takOverlay}
                    />
                  </div>
                </Tab>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      <PostingScheduleModal
        isOpen={showPostingSchedule}
        onClose={() => setShowPostingSchedule(false)}
        event={event}
        postAssignments={postAssignments}
        onPostAssignment={handlePostAssignment}
        onBulkPostAssignment={handleBulkPostAssignment}
        onClearAllPostAssignments={handleClearAllPostAssignments}
        onUpdatePostingTime={handleUpdatePostingTime}
        getCurrentActiveTime={getCurrentActiveTime}
        updateEvent={updateEvent}
        notifyPostAssignmentChange={notifyPostAssignmentChange}
      />

      {!isLiteMode && (
        <>
          {/* Cloud-only modals */}
          <EventSummaryModal
            open={showEventSummary}
            onClose={() => setShowEventSummary(false)}
            onExportCsv={handleExportSummaryCsv}
            eventId={event.id}
          />

          <EndEventModal
            isOpen={showEndEventModal}
            onClose={() => setShowEndEventModal(false)}
            onConfirm={handleEndEvent}
          />
        </>
      )}

      {showDuplicateModal && selectedDuplicateCallId && (
        <DuplicateCallModal
          duplicateCallId={selectedDuplicateCallId}
          calls={event.calls}
          callDisplayNumberMap={callDisplayNumberMap}
          onSelectOriginal={handleResolveDuplicate}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
    </DispatchVocabularyProvider>
  );
}
