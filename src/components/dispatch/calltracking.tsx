// components/calltracking.tsx
'use client';

import React, {} from 'react';
import CallRowFooters from './callrowfooter';
import { CallAddButton, CallAddMenuExtras, CallNumberMarks } from './callextras';
import { 
  Button, 
  Chip, 
  Dropdown, 
  DropdownTrigger, 
  DropdownMenu, 
  DropdownItem,
} from '@heroui/react';
import { MoreVertical, RotateCw } from "@/components/ui/icons";
import type { Event, Call, Supervisor, DetachedTeam } from '@/app/types';
import { useCallTrackingState } from '@/hooks/useCallTrackingState';
import CallTrackingDetails from '@/components/dispatch/calltrackingdetails';
import DispatchMotionCell from './motioncell';
import StatusLabel, { getMenuLabel } from './statuslabel';
import EquipmentTypeIcon, { getEquipmentStatusMenuLabel, getEquipmentStatusWord, isEquipmentIconStatus } from './equipmenttypeicon';
import TrackingTableBase, { INLINE_CELL_INPUT_CLASS, INLINE_CELL_PLACEHOLDER, InlineCellBox, TrackingEmpty } from './trackingtablebase';
import CrowdcadRadioIcon from '@/components/ui/crowdcad-radio-icon';
import PendingCallChip from './pendingcallchip';
import StatusCodeKeys from './statuscodekeys';
import { codeForStatus } from '@/lib/statusCodes';
import { TRACKING_RESOLVED_CLASS, TRACKING_RESOLVED_CHIP_CLASS, getStatusColor, TRACKING_ROW_HOVER_CLASS, TRACKING_ROW_OPEN_CLASS } from '@/lib/statusColors';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { getEventClinics, getTransportClinicId, RESOLVED_CALL_STATUSES, getVenueLocationOptions } from '@/lib/clinics';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { withPendingSuffix } from '@/lib/callTiming';
import { sortActiveCalls, sortResolvedCalls, type CallSortMode } from '@/lib/callSort';
import CallIndicatorIcons from './callindicatoricons';
import { UnitPickerItems, UnitPickerLabel } from './unitpicker';
import { unitOptions } from '@/lib/unitDistance';
import { getEventVenueLayers } from '@/lib/zones';
import type { UnitTracking } from '@/lib/unitTracking';
import HeldEquipmentIcons from './heldequipmenticons';
import AddEquipmentSubmenu from './addequipmentmenu';

import {
  Dropdownmenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dropdownMotionProps, pinCallPatch } from './trackingcardparts';
import { textToLog } from '@/lib/logText';
import { EQUIPMENT_RUN_STATUSES, equipmentOfUnit, fleetOf } from '@/lib/equipmentCustody';
import { hhmmOf } from '@/lib/clock';
import PinDropModal, { firstGeoLayer } from '@/components/geo/PinDropModal';

// Define EditableCallField type locally
type EditableCallField = keyof Call | 'ageSex';

interface CallTrackingTableProps {
  event: Event;
  /** Live unit positions (an extension pack's), for distances in Add Team / Add Supervisor. */
  unitTracking?: UnitTracking | null;
  /** Restricts which calls this table displays (e.g. a dispatch zone's tab, scoped to calls whose location falls in that zone) — mutations still always operate on the full `event.calls`, only the resolved/active lists rendered below are filtered. Omit to show every call, as "All Calls"/"Calls" does. */
  filterCalls?: (call: Call) => boolean;
  /** What the table says when no calls show, e.g. naming the zone it's filtered to. Defaults to "No active calls". */
  emptyText?: string;
  callDisplayNumberMap: Map<string, number>;
  showResolvedCalls: boolean;
  setShowResolvedCalls: (value: boolean | ((prev: boolean) => boolean)) => void;
  openCallId: string | null;
  setOpenCallId: (value: string | null) => void;
  editingCell: { callId: string; field: EditableCallField } | null;
  setEditingCell: React.Dispatch<React.SetStateAction<{ callId: string; field: EditableCallField } | null>>;
  editValue: string;
  setEditValue: (value: string) => void;
  teamStatusMap: Record<string, Record<string, string>>;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  handleCellClick: <K extends keyof Call>(callId: string, field: K, value?: Call[K]) => void;
  handleCellBlur: <K extends keyof Call>(callId: string, field: K) => Promise<void>;
  handleAgeSexBlur: (callId: string) => Promise<void>;
  handleRowClick: (e: React.MouseEvent, callId: string) => void;
  handleMarkDuplicate: (callId: string) => void;
  handleTogglePriorityFromMenu: (callId: string) => void;
  handleTogglePin: (callId: string) => void;
  sortMode: CallSortMode;
  handleDeleteCall: (callId: string) => void;
  handleTeamStatusChange: (callId: string, team: string, newStatus: string, clinicId?: string) => void;
  onTransportToAmbulance: (callId: string, team: string) => void;
  handleRemoveTeamFromCall: (callId: string, team: string) => Promise<void>;
  handleAddTeamToCall: (callId: string, team: string) => Promise<void>;
  handleRevertDetachment: (callId: string, team: string) => void;
  formatAgeSex: (age?: string | number, gender?: string) => string;
  /** Overrides the default column widths. Must be a stable (module-scope) component. */
  TableColGroup?: React.ComponentType;
}

interface LogEntry {
  timestamp: number;
  message: string;
}


const DETAILS_CLOSE_ANIMATION_MS = 320;

export const CallTrackingTable: React.FC<CallTrackingTableProps> = ({
  event,
  unitTracking,
  filterCalls,
  emptyText,
  callDisplayNumberMap,
  showResolvedCalls,
  setShowResolvedCalls,
  openCallId,
  setOpenCallId,
  editingCell,
  setEditingCell,
  editValue,
  setEditValue,
  teamStatusMap,
  updateEvent,
  handleCellClick,
  handleCellBlur,
  handleAgeSexBlur,
  handleRowClick,
  handleMarkDuplicate,
  handleTogglePriorityFromMenu,
  handleTogglePin,
  sortMode,
  handleDeleteCall,
  handleTeamStatusChange,
  onTransportToAmbulance,
  handleRemoveTeamFromCall,
  handleAddTeamToCall,
  handleRevertDetachment,
  formatAgeSex,
  TableColGroup,
}) => {
  // const ButtonRefs = useRef<Record<string, HTMLElement | null>>({});
  const [closingCallId, setClosingCallId] = React.useState<string | null>(null);
  const [openMenuToken, setOpenMenuToken] = React.useState<string | null>(null);
  // Which status opened the "team-clinic-pick" token — 'Transporting' or
  // 'Delivered', both of which need a destination clinic recorded when more
  // than one exists.
  const [clinicPickStatus, setClinicPickStatus] = React.useState<string>('Transporting');
  const previousOpenCallIdRef = React.useRef<string | null>(null);
  // HeroUI/react-aria's Popover can spuriously fire onOpenChange(false) a few
  // milliseconds after opening, with no user interaction (a known upstream
  // focus/blur-tracking race — see adobe/react-spectrum#4533). Real users
  // never dismiss a menu that fast, so ignore closes inside this window
  // unless they came from an actual selection (onAction).
  const { t } = useDispatchTerms();
  const clinics = getEventClinics(event.clinics);
  const locationOptions = React.useMemo(() => getVenueLocationOptions(event.venue), [event.venue]);

  // Detached-team pill label — 'Delivered Eq' shows the equipment's own
  // icon, using the equipmentNames captured at detach time (the equipment
  // record itself is no longer linked to this team by the time it's
  // rendered here — delivering unassigns it, see handleTeamStatusChange's
  // isEqDetaching branch); every other reason (including 'Delivered', via
  // STATUS_ICONS) is a plain icon-aware status label.
  const renderDetachedReason = (detachedTeam: DetachedTeam) => {
    const { reason, equipmentNames } = detachedTeam;
    if (reason === 'Delivered Eq' && equipmentNames?.[0]) {
      return (
        <span className="inline-flex items-center gap-1">
          <span>{getEquipmentStatusWord('Delivered Eq')}</span>
          <EquipmentTypeIcon type={getEquipmentIconType(equipmentNames[0])} />
        </span>
      );
    }
    return <StatusLabel status={reason} text={t(reason)} />;
  };

  const TEAM_STATUS_MENU_CLOSE_GUARD_MS = 150;
  const teamStatusMenuOpenedAtRef = React.useRef<number>(0);
  const teamStatusMenuSelectedRef = React.useRef<boolean>(false);
  const {
    notesTexts,
    setNotesTexts,
    notesFocusedRef,
    logTexts,
    setLogTexts,
    logFocusedRef,
    pendingValues,
    markPendingValue,
  } = useCallTrackingState(event, formatAgeSex);

  const resolvedCallStatuses = RESOLVED_CALL_STATUSES;
  const venueLayers = getEventVenueLayers(event);
  const canDropPin = !!firstGeoLayer(venueLayers);
  const [pinCallId, setPinCallId] = React.useState<string | null>(null);
  const pinCall = pinCallId ? event.calls.find((c: Call) => c.id === pinCallId) : undefined;

  // Most recently resolved first.
  const resolvedCalls = sortResolvedCalls(
    event.calls
      .filter((call: Call) => resolvedCallStatuses.includes(call.status))
      .filter((call: Call) => !filterCalls || filterCalls(call))
  );

  const activeCalls = sortActiveCalls(
    event.calls
      .filter((call: Call) => !resolvedCallStatuses.includes(call.status))
      .filter((call: Call) => !filterCalls || filterCalls(call)),
    sortMode
  );

  React.useEffect(() => {
    if (!openMenuToken) return;

    const [, tokenCallId] = openMenuToken.split(':');
    const tokenCall = event.calls.find((call: Call) => call.id === tokenCallId);
    if (!tokenCall) {
      setOpenMenuToken(null);
      return;
    }

    const tokenCallIsResolved = resolvedCallStatuses.includes(tokenCall.status);
    if (tokenCallIsResolved && !showResolvedCalls) {
      setOpenMenuToken(null);
    }
  }, [openMenuToken, event.calls, showResolvedCalls]);

  React.useEffect(() => {
    if (!openCallId) return;

    const openCall = event.calls.find((call: Call) => call.id === openCallId);
    if (!openCall) {
      setOpenCallId(null);
      setClosingCallId(null);
      setOpenMenuToken(null);
      return;
    }

    const isOpenCallResolved = resolvedCallStatuses.includes(openCall.status);
    if (isOpenCallResolved && !showResolvedCalls) {
      setOpenCallId(null);
      setClosingCallId(null);
      setOpenMenuToken(null);
    }
  }, [event.calls, openCallId, resolvedCallStatuses, setOpenCallId, showResolvedCalls]);

  React.useLayoutEffect(() => {
    const previousOpenCallId = previousOpenCallIdRef.current;

    if (previousOpenCallId && previousOpenCallId !== openCallId) {
      setClosingCallId(previousOpenCallId);
      const timeout = window.setTimeout(() => {
        setClosingCallId((current) => (current === previousOpenCallId ? null : current));
      }, DETAILS_CLOSE_ANIMATION_MS);

      previousOpenCallIdRef.current = openCallId;
      return () => window.clearTimeout(timeout);
    }

    if (!openCallId && closingCallId) {
      const closingId = closingCallId;
      const timeout = window.setTimeout(() => {
        setClosingCallId((current) => (current === closingId ? null : current));
      }, DETAILS_CLOSE_ANIMATION_MS);

      previousOpenCallIdRef.current = openCallId;
      return () => window.clearTimeout(timeout);
    }

    previousOpenCallIdRef.current = openCallId;
    return undefined;
  }, [closingCallId, openCallId]);


  // Only when there are resolved calls to show.
  const resolvedToggleFooter = resolvedCalls.length > 0 && (
    <div className="flex justify-center pt-3">
      <button
        onClick={() => setShowResolvedCalls(prev => !prev)}
        className="text-surface-faint text-base hover:text-surface-light"
        aria-label="Toggle resolved calls"
      >
        {showResolvedCalls ? t('Hide Resolved Calls') : t('Show Resolved Calls')}
      </button>
    </div>
  );

  return (
    <div className="col-span-2 text-black w-full h-full min-h-0">
      <TrackingTableBase
        TableColGroup={TableColGroup}
        showStatusColumn={false}
        showTeamAssignmentChips={true}
        footer={resolvedToggleFooter}
        empty={activeCalls.length === 0 && (!showResolvedCalls || resolvedCalls.length === 0) && <TrackingEmpty icon={CrowdcadRadioIcon} text={emptyText ?? t('No active calls')} />}
      >
              {[
                // Active calls first
                ...activeCalls,
                ...resolvedCalls,
              ].map((call: Call) => {
                const pendingForCall = pendingValues[call.id] || {};
                const isResolvedCall = resolvedCallStatuses.includes(call.status);
                const resolvedIndex = isResolvedCall ? resolvedCalls.findIndex((resolvedCall) => resolvedCall.id === call.id) : -1;
                const isMotionVisible = !isResolvedCall || showResolvedCalls;
                const motionDelayMs = isResolvedCall && resolvedIndex >= 0 ? resolvedIndex * 30 : 0;
                const isActionMenuOpen = openMenuToken === `action:${call.id}` && isMotionVisible;
                const rowRenderKey = `${call.id}:${isResolvedCall ? 'resolved' : 'active'}:${isMotionVisible ? 'visible' : 'hidden'}`;
                return (
                <React.Fragment key={rowRenderKey}>
                  {(() => {
                    const isOpen = openCallId === call.id || closingCallId === call.id;
                    const hoverClass = !isOpen ? TRACKING_ROW_HOVER_CLASS : '';
                    // Open (or still collapsing): highlighted at once, no fade. Closed rows keep the hover fade.
                    const rowBg = isOpen ? TRACKING_ROW_OPEN_CLASS : `bg-transparent transition-colors ${hoverClass}`;
                    return (
                  <tr
                      data-testid={`call-row-${callDisplayNumberMap.get(call.id)}`}
                      className={`cursor-pointer min-h-3.25rem ${rowBg} ${isResolvedCall ? TRACKING_RESOLVED_CLASS : ''} rounded-none ${isResolvedCall && !isMotionVisible ? '[&>td]:!border-b-0 pointer-events-none' : ''} ${openCallId === call.id ? '[&>td]:!border-b-0' : ''}`}
                    aria-hidden={isResolvedCall && !isMotionVisible}
                    onClick={(e) => handleRowClick(e, call.id)}
                  >
                        <td className="p-0">
                          <DispatchMotionCell isOpen={isMotionVisible} animate={isResolvedCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1">
                              {callDisplayNumberMap.get(call.id)}
                              <CallNumberMarks call={call} />
                            </span>
                          </DispatchMotionCell>
                        </td>
                        
                        {/* Chief Complaint */}
                        <td className="p-0">
                          <DispatchMotionCell isOpen={isMotionVisible} animate={isResolvedCall} delayMs={motionDelayMs} className="px-3 py-2.5 truncate">
                            {editingCell?.callId === call.id && editingCell.field === 'chiefComplaint' ? (
                              <input
                                type="text"
                                value={editValue}
                                autoFocus
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={async () => {
                                  markPendingValue(call.id, 'chiefComplaint', editValue);
                                  try {
                                    await handleCellBlur(call.id, 'chiefComplaint');
                                  } catch {
                                    // ignore - pending will be cleared by effect if updated
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                  } else if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleCellBlur(call.id, 'chiefComplaint').then(() => {
                                      setEditingCell({ callId: call.id, field: 'ageSex' });
                                      setEditValue(formatAgeSex(call.age, call.gender));
                                    });
                                  }
                                }}
                                placeholder={INLINE_CELL_PLACEHOLDER}
                                className={INLINE_CELL_INPUT_CLASS}
                              />
                            ) : (
                              // Prefer a pending value while saving to avoid flashing the placeholder
                              <InlineCellBox onEdit={() => handleCellClick(call.id, 'chiefComplaint', call.chiefComplaint)} value={pendingForCall.chiefComplaint !== undefined ? pendingForCall.chiefComplaint : call.chiefComplaint} />
                            )}
                          </DispatchMotionCell>
                        </td>
                        
                        {/* Age/Sex */}
                        <td className="p-0">
                          <DispatchMotionCell isOpen={isMotionVisible} animate={isResolvedCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                            {editingCell?.callId === call.id && editingCell.field === 'ageSex' ? (
                              <input
                                type="text"
                                value={editValue}
                                autoFocus
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={async () => {
                                  markPendingValue(call.id, 'ageSex', editValue);
                                  try {
                                    await handleAgeSexBlur(call.id);
                                  } catch {}
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                  } else if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAgeSexBlur(call.id).then(() => {
                                      setEditingCell({ callId: call.id, field: 'location' });
                                      setEditValue(call.location || '');
                                    });
                                  }
                                }}
                                placeholder={INLINE_CELL_PLACEHOLDER}
                                className={INLINE_CELL_INPUT_CLASS}
                              />
                            ) : (
                              <InlineCellBox
                                onEdit={() => {
                                  setEditingCell({ callId: call.id, field: 'ageSex' });
                                  setEditValue(formatAgeSex(call.age, call.gender));
                                }}
                                value={pendingForCall.ageSex !== undefined ? pendingForCall.ageSex : formatAgeSex(call.age, call.gender)}
                              />
                            )}
                          </DispatchMotionCell>
                        </td>
                        
                        {/* Location */}
                        <td className="p-0">
                          <DispatchMotionCell isOpen={isMotionVisible} animate={isResolvedCall} delayMs={motionDelayMs} className="px-3 py-2.5 truncate">
                            {editingCell?.callId === call.id && editingCell.field === 'location' ? (
                              <>
                                <input
                                  type="text"
                                  list={`location-options-${call.id}`}
                                  value={editValue}
                                  autoFocus
                                  onChange={e => setEditValue(e.target.value)}
                                  onFocus={e => {
                                    // If the value is "Unknown", select all text so it's easy to replace
                                    if (editValue === 'Unknown') {
                                      e.target.select();
                                    }
                                  }}
                                  onBlur={() => handleCellBlur(call.id, 'location')}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  placeholder={INLINE_CELL_PLACEHOLDER}
                                  className={INLINE_CELL_INPUT_CLASS}
                                />
                                {/* Native datalist: suggests existing venue locations while still accepting free text. */}
                                <datalist id={`location-options-${call.id}`}>
                                  {locationOptions.map(loc => (
                                    <option key={loc} value={loc} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              <InlineCellBox onEdit={() => handleCellClick(call.id, 'location', call.location)} value={call.location} />
                            )}
                          </DispatchMotionCell>
                        </td>
                        
                        {/* Team - Updated with larger Chips and shadcn dropdown. Chips wrap
                            onto additional lines (instead of forcing the cell to grow
                            arbitrarily wide) so a call with several teams grows the row's
                            height, not its width into neighboring columns like the
                            3-dot menu. */}
                        <td
                          className="p-0 relative z-0"
                        >
                          <DispatchMotionCell isOpen={isMotionVisible} animate={isResolvedCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                            <div className="relative z-0 flex flex-wrap items-center gap-2">
                            {(call.assignedTeam || []).length === 0 && !isResolvedCall && (
                              <PendingCallChip since={call.log?.[0]?.timestamp} label={t('Pending')} />
                            )}
                            {/* Active assigned teams - Larger chips with centered dropdown */}
                            {(Array.isArray(call.assignedTeam) ? call.assignedTeam : []).map((team: string) => {
                              const isEquipmentOnlyTeam = call.equipmentTeams?.includes(team);
                              const statusOptions = isEquipmentOnlyTeam
                                ? EQUIPMENT_RUN_STATUSES
                                : ['En Route', 'On Scene', 'Unable to Locate', 'Transporting', 'Pending Transport', 'Rolled from Scene', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Detached'];
                              const currentTeamStatus = teamStatusMap[call.id]?.[team] || event?.staff.find(s => s.team === team)?.status || 'En Route';
                              const teamStatusColor = getStatusColor(currentTeamStatus);

                              // Equipment this team is actually running — used to swap the
                              // pill's "Eq" suffix for the matching map icon, and to name the
                              // specific item in the dropdown options and the activity log.
                              const teamEquipment = isEquipmentOnlyTeam
                                ? equipmentOfUnit(fleetOf(event), event, team)
                                : [];
                              const teamEquipmentNames = teamEquipment.map(eq => eq.name).join(', ');
                              const teamEquipmentIconType = teamEquipment[0] ? getEquipmentIconType(teamEquipment[0].name) : null;
                              const isEqStatus = isEquipmentIconStatus(currentTeamStatus);
                              // Reuses the chip's own translucent status fill on the status
                              // button — stacked on top of the chip's already-tinted
                              // background, the same semi-transparent token reads visibly
                              // darker/more saturated, marking this piece out as a button
                              // without introducing a whole new color.
                              const statusButtonClass = `min-w-0 h-7 px-2 shrink-0 text-surface-light ${teamStatusColor.fillClass} hover:brightness-110`;
                              const pickTeamStatus = (key: string) => {
                                teamStatusMenuSelectedRef.current = true;
                                // A destination picked when the team went Transporting carries over —
                                // Delivered only asks again if no clinic was chosen yet.
                                const transportClinicId = key === 'Delivered' ? getTransportClinicId(call, currentTeamStatus, clinics) : undefined;
                                if (transportClinicId) {
                                  handleTeamStatusChange(call.id, team, 'Delivered', transportClinicId);
                                  return;
                                }
                                if ((key === 'Transporting' || key === 'Delivered') && clinics.length > 1) {
                                  setOpenMenuToken(`team-clinic-pick:${call.id}:${team}`);
                                  setClinicPickStatus(key);
                                  return;
                                }
                                if (key === 'Rolled from Scene') {
                                  onTransportToAmbulance(call.id, team);
                                  return;
                                }
                                handleTeamStatusChange(call.id, team, key, (key === 'Transporting' || key === 'Delivered') ? clinics[0]?.id : undefined);
                              };

                              return (
                                <Chip
                                  key={team}
                                  size="lg"
                                  variant="flat"
                                  color="default"
                                  className={`text-surface-light h-8 shrink-0 ${teamStatusColor.chipClass} ${isResolvedCall ? TRACKING_RESOLVED_CHIP_CLASS : ''}`}
                                  onClose={() => handleRemoveTeamFromCall(call.id, team)}
                                >
                                  <div className="flex items-center gap-2" data-testid={`team-chip-${team}`}>
                                    <span>{team}</span>
                                    {!isEquipmentOnlyTeam && <HeldEquipmentIcons event={event} unit={team} />}
                                    {openMenuToken === `team-clinic-pick:${call.id}:${team}` ? (
                                      <Dropdown
                                        motionProps={dropdownMotionProps}
                                        isOpen={isMotionVisible}
                                        onOpenChange={(isOpen) => {
                                          if (isOpen) return;
                                          setOpenMenuToken((current) =>
                                            current === `team-clinic-pick:${call.id}:${team}` ? null : current
                                          );
                                        }}
                                      >
                                        <DropdownTrigger>
                                          <Button
                                            size="sm"
                                            radius="full"
                                            variant="light"
                                            className={statusButtonClass}
                                          >
                                            {t('Select clinic')}
                                          </Button>
                                        </DropdownTrigger>
                                        <DropdownMenu
                                          aria-label="Select destination clinic"
                                          onAction={(key) => {
                                            setOpenMenuToken(null);
                                            handleTeamStatusChange(call.id, team, clinicPickStatus, key as string);
                                          }}
                                        >
                                          {clinics.map((clinic) => (
                                            <DropdownItem key={clinic.id}>{clinic.name}</DropdownItem>
                                          ))}
                                        </DropdownMenu>
                                      </Dropdown>
                                    ) : (
                                      <Dropdown
                                        motionProps={dropdownMotionProps}
                                        isOpen={openMenuToken === `team-status:${call.id}:${team}` && isMotionVisible}
                                        onOpenChange={(isOpen) => {
                                          if (isOpen) {
                                            if (isResolvedCall && !showResolvedCalls) return;
                                            teamStatusMenuOpenedAtRef.current = Date.now();
                                            setOpenMenuToken(`team-status:${call.id}:${team}`);
                                            return;
                                          }
                                          const selected = teamStatusMenuSelectedRef.current;
                                          teamStatusMenuSelectedRef.current = false;
                                          if (!selected && Date.now() - teamStatusMenuOpenedAtRef.current < TEAM_STATUS_MENU_CLOSE_GUARD_MS) {
                                            return;
                                          }
                                          setOpenMenuToken((current) =>
                                            current === `team-status:${call.id}:${team}` ? null : current
                                          );
                                        }}
                                      >
                                        <DropdownTrigger>
                                          <Button
                                            size="sm"
                                            radius="full"
                                            variant="light"
                                            className={statusButtonClass}
                                            data-testid={`team-status-${team}`}
                                          >
                                            {isEqStatus && teamEquipmentIconType ? (
                                              <span className="inline-flex items-center gap-1">
                                                <span>{getEquipmentStatusWord(currentTeamStatus)}</span>
                                                <EquipmentTypeIcon type={teamEquipmentIconType} />
                                              </span>
                                            ) : (
                                              <StatusLabel status={currentTeamStatus} text={t(currentTeamStatus)} />
                                            )}
                                          </Button>
                                        </DropdownTrigger>
                                        <DropdownMenu
                                          aria-label="Team status"
                                          // Typing a status code (UTL, NMM, AMA) picks it too.
                                          topContent={
                                            <StatusCodeKeys
                                              options={statusOptions}
                                              onPick={(status) => {
                                                pickTeamStatus(status);
                                                setOpenMenuToken((current) => (current === `team-status:${call.id}:${team}` ? null : current));
                                              }}
                                            />
                                          }
                                          onAction={(key) => pickTeamStatus(key as string)}
                                        >
                                          {statusOptions.map((status: string) => (
                                            <DropdownItem key={status} data-testid={`team-status-option-${status}`} shortcut={codeForStatus(status)}>
                                              {isEquipmentIconStatus(status) && teamEquipmentNames
                                                ? getEquipmentStatusMenuLabel(status, teamEquipmentNames)
                                                : getMenuLabel(status, t)}
                                            </DropdownItem>
                                          ))}
                                        </DropdownMenu>
                                      </Dropdown>
                                    )}
                                  </div>
                                </Chip>
                              );
                            })}
                            
                            {/* Detached teams */}
                            {call.detachedTeams?.map((detachedTeam: DetachedTeam) => (
                              <Chip
                                key={detachedTeam.team}
                                size="lg"
                                variant="flat"
                                color="default"
                                className={`h-8 ${getStatusColor(detachedTeam.reason).chipClass} ${isResolvedCall ? TRACKING_RESOLVED_CHIP_CLASS : ''}`}
                                onClose={() => handleRevertDetachment(call.id, detachedTeam.team)}
                                endContent={<RotateCw className="w-3.5 h-3.5" aria-label={t('Reopen Call')} />}
                              >
                                <span className="text-surface-light font-medium mr-2">
                                  {detachedTeam.team}
                                </span>
                                <Button
                                  size="sm"
                                  radius="full"
                                  variant="light"
                                  isDisabled
                                  className="min-w-0 h-6 px-2 text-xs shrink-0 opacity-100 cursor-default"
                                >
                                  {renderDetachedReason(detachedTeam)}
                                </Button>
                              </Chip>
                            ))}

                            {/* Add Team Button with shadcn DropdownMenu — disabled once the
                                call is resolved; only reopening it via handleRevertDetachment
                                re-enables this. */}
                            <Dropdownmenu>
                              <DropdownMenuTrigger asChild>
                                <CallAddButton call={call} disabled={isResolvedCall} className={`shrink-0 ${isResolvedCall ? TRACKING_RESOLVED_CHIP_CLASS : ''}`} testId="call-add-menu" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="bg-surface-deep border-surface-liner text-surface-light">
                                <CallAddMenuExtras call={call} />

                                {/* A point on the map for a place that isn't a venue location (venues with a geo map). */}
                                {canDropPin && (
                                  <DropdownMenuItem
                                    data-testid="call-drop-pin"
                                    className="text-surface-light hover:bg-surface-liner focus:bg-surface-liner cursor-pointer"
                                    onClick={() => setPinCallId(call.id)}
                                  >
                                    {call.locationPoint ? t('Move pin') : t('Drop pin')}
                                  </DropdownMenuItem>
                                )}

                                {/* Add Team Submenu */}
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger data-testid="call-add-team" className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                                    {t('Add Team')}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                                    {/* Free teams nearest first, with where each is and how far from this call. */}
                                    <UnitPickerItems
                                      options={unitOptions(event, call, 'team', venueLayers, unitTracking)}
                                      onPick={(team) => handleAddTeamToCall(call.id, team)}
                                      emptyLabel={t('No available teams')}
                                      testIdPrefix="call-add-team"
                                    />
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>

                                {/* Add Supervisor Submenu */}
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                                    {t('Add Supervisor')}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                                    {unitOptions(event, call, 'supervisor', venueLayers, unitTracking)
                                      .map((option) => ({ option, supervisor: event.supervisor!.find((x: Supervisor) => x.team === option.name)! }))
                                      .map(({ option, supervisor }) => {
                                        const match = supervisor.member.match(/^(.+?)\s\[(.+?)\]/);
                                        const memberName = match ? match[1] : supervisor.member;
                                        const isInactive = option.inactive;
                                        return (
                                          <DropdownMenuItem
                                            key={`supervisor-${supervisor.team}`}
                                            className={`text-surface-light hover:bg-surface-liner focus:bg-surface-liner cursor-pointer ${isInactive ? 'bg-status-card-blue' : ''}`}
                                            onClick={async () => {
                                              const now = new Date();
                                              const hhmm = hhmmOf(now);

                                              const callLogEntry = {
                                                timestamp: now.getTime(),
                                                message: withPendingSuffix(`${hhmm} - Supervisor ${memberName} (${supervisor.team}) assigned to call.`, call, now)
                                              };
                                              const teamLogEntry = {
                                                timestamp: now.getTime(),
                                                message: `${hhmm} - responding to call #${callDisplayNumberMap.get(call.id)} (supervisor support)`
                                              };

                                              const updatedCall = {
                                                ...call,
                                                assignedTeam: [...(call.assignedTeam || []), supervisor.team],
                                                status: call.assignedTeam?.length ? call.status : 'Assigned',
                                                log: [...(call.log || []), callLogEntry]
                                              };

                                              const updatedSupervisor = event.supervisor?.map((s: Supervisor) =>
                                                s.team === supervisor.team
                                                  ? {
                                                      ...s,
                                                      status: 'En Route',
                                                      location: call.location,
                                                      originalPost: s.location || 'Unknown',
                                                      log: [...(s.log || []), teamLogEntry]
                                                    }
                                                  : s
                                              );

                                              const updatedCalls = event.calls.map((c: Call) => (c.id === call.id ? updatedCall : c));

                                              await updateEvent({
                                                calls: updatedCalls,
                                                supervisor: updatedSupervisor
                                              });
                                            }}
                                          >
                                            <UnitPickerLabel option={option} />
                                          </DropdownMenuItem>
                                        );
                                      })}
                                    {(!event.supervisor || event.supervisor.filter((supervisor: Supervisor) => {
                                      const notAssignedToThisCall = !call.assignedTeam?.includes(supervisor.team);
                                      const isAvailable = supervisor.status === 'Available' ||
                                        !event.calls?.some((c: Call) => 
                                          c.assignedTeam?.includes(supervisor.team) && 
                                          !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled'].includes(c.status)
                                        );
                                      return notAssignedToThisCall && isAvailable;
                                    }).length === 0) && (
                                      <DropdownMenuItem disabled className="text-surface-light/50">
                                        {t('No supervisors available')}
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>

                                <AddEquipmentSubmenu call={call} event={event} callNumber={callDisplayNumberMap.get(call.id)} updateEvent={updateEvent} layers={venueLayers} tracking={unitTracking} />
                              </DropdownMenuContent>
                            </Dropdownmenu>
                            </div>
                          </DispatchMotionCell>
                        </td>
                        {/* Options Ellipsis */}
                        <td className="p-0">
                          <DispatchMotionCell isOpen={isMotionVisible} animate={isResolvedCall} delayMs={motionDelayMs} className="px-3 py-2.5 flex items-center justify-end gap-1.5">
                            <CallIndicatorIcons call={call} />
                            <Dropdown
                              motionProps={dropdownMotionProps}
                              placement="bottom-end"
                              offset={6}
                              shouldBlockScroll={false}
                              isOpen={isActionMenuOpen}
                              onOpenChange={(isOpen) => {
                                if (isOpen) {
                                  if (isResolvedCall && !showResolvedCalls) return;
                                  setOpenMenuToken(`action:${call.id}`);
                                  return;
                                }
                                setOpenMenuToken((current) => (current === `action:${call.id}` ? null : current));
                              }}
                            >
                              <DropdownTrigger>
                                <button
                                  className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
                                  aria-label="Call actions"
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownTrigger>
                              <DropdownMenu aria-label="Call actions">
                                <DropdownItem 
                                  key="showLog"
                                  onPress={() => {
                                    setOpenMenuToken(null);
                                    setOpenCallId(openCallId === call.id ? null : call.id);
                                  }}
                                >
                                  {openCallId === call.id ? t('Hide Log') : t('Show Log')}
                                </DropdownItem>
                                <DropdownItem
                                  key="duplicate"
                                  onPress={() => {
                                    setOpenMenuToken(null);
                                    handleMarkDuplicate(call.id);
                                  }}
                                >
                                  {t('Mark as Duplicate')}
                                </DropdownItem>
                                <DropdownItem
                                  key="priority"
                                  isDisabled={!!call.clinic}
                                  onPress={() => {
                                    setOpenMenuToken(null);
                                    handleTogglePriorityFromMenu(call.id);
                                  }}
                                >
                                  {call.priority ? t('Remove Priority') : t('Mark as Priority')}
                                </DropdownItem>
                                <DropdownItem
                                  key="pin"
                                  isDisabled={isResolvedCall}
                                  onPress={() => {
                                    setOpenMenuToken(null);
                                    handleTogglePin(call.id);
                                  }}
                                >
                                  {call.pin ? t('Unpin Call') : t('Pin Call')}
                                </DropdownItem>
                                <DropdownItem
                                  key="delete"
                                  className="text-danger"
                                  color="danger"
                                  onPress={() => {
                                    setOpenMenuToken(null);
                                    if (confirm('Are you sure you want to delete this call? This action cannot be undone.')) {
                                      handleDeleteCall(call.id);
                                    }
                                  }}
                                >
                                  {t('Delete Call')}
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </DispatchMotionCell>
                        </td>
                      </tr>
                        );
                      })()}
                  
                  {isMotionVisible && <CallRowFooters call={call} colSpan={6} />}

                  {/* Expanded row for notes and log - NO ANIMATION */}
                  {isMotionVisible && (openCallId === call.id || closingCallId === call.id) && (
                    <CallTrackingDetails
                      key={`${call.id}-details`}
                      rowClassName={TRACKING_ROW_OPEN_CLASS}
                      callDisplayNumber={callDisplayNumberMap.get(call.id)}
                      isOpen={openCallId === call.id}
                      notesText={notesTexts[call.id] ?? (call.notes || '')}
                      onNotesChange={(value) => {
                        setNotesTexts((prev) => ({ ...prev, [call.id]: value }));
                      }}
                      onNotesFocus={() => {
                        notesFocusedRef.current = call.id;
                      }}
                      onNotesBlur={async () => {
                        notesFocusedRef.current = null;
                        const text = notesTexts[call.id] ?? '';
                        const callNow = event?.calls.find((currentCall: Call) => currentCall.id === call.id);
                        if (!callNow) return;

                        if ((callNow.notes || '') !== text) {
                          const updatedCall = { ...callNow, notes: text };
                          const updated = event!.calls.map((currentCall: Call) =>
                            currentCall.id === call.id ? updatedCall : currentCall
                          );
                          await updateEvent({ calls: updated });
                        }
                      }}
                      logText={logTexts[call.id] ?? (() => {
                        if (call.log && call.log.length > 0) {
                          return call.log.map((entry: LogEntry) => entry.message).join('\n');
                        }
                        return '';
                      })()}
                      onLogChange={(value) => {
                        setLogTexts((prev) => ({ ...prev, [call.id]: value }));
                      }}
                      onLogFocus={() => {
                        logFocusedRef.current = call.id;
                      }}
                      onLogBlur={async () => {
                        logFocusedRef.current = null;
                        const text = logTexts[call.id] ?? '';
                        const callNow = event?.calls.find((currentCall: Call) => currentCall.id === call.id);
                        if (!callNow) return;

                        // Keep unchanged lines' timestamps — the call timer counts from the first entry.
                        const newLog = textToLog(text, callNow.log);
                        if (!newLog) return;

                        const updatedCall = { ...callNow, log: newLog };
                        const updated = event!.calls.map((currentCall: Call) =>
                          currentCall.id === call.id ? updatedCall : currentCall
                        );
                        await updateEvent({ calls: updated });
                      }}
                      onLogInsertTimestamp={() => {
                        const now = new Date();
                        const hhmm = hhmmOf(now);
                        setLogTexts((prev) => ({ ...prev, [call.id]: (prev[call.id] || '') + `\n${hhmm} - ` }));
                      }}
                      onClose={() => setOpenCallId(null)}
                    />
                  )}
                </React.Fragment>
                );
              })}
      </TrackingTableBase>
      <PinDropModal
        isOpen={!!pinCall}
        onClose={() => setPinCallId(null)}
        layers={venueLayers}
        initial={pinCall?.locationPoint}
        onPick={(pin) => pinCall && void updateEvent(pinCallPatch(event, pinCall.id, pin))}
      />
    </div>
  );
};
