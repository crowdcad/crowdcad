// calltrackingcard.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  Card, CardHeader, CardBody, Chip, Button,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Autocomplete, AutocompleteItem
} from '@heroui/react';
import { Plus, MoreVertical, RotateCw } from 'lucide-react';
import {
  Dropdownmenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Event, Call, DetachedTeam } from '@/app/types';
import StatusLabel, { getMenuLabel } from '@/components/dispatch/statuslabel';
import EquipmentTypeIcon, { getEquipmentStatusWord } from '@/components/dispatch/equipmenttypeicon';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { getEventClinics, getTransportClinicId, isCallResolved, getVenueLocationOptions } from '@/lib/clinics';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { getStatusColor } from '@/lib/statusColors';
import { STATIC_SELECTOR_BUTTON_CLASS, staticSelectorButtonProps } from '@/lib/autocompleteSelector';
import CallIndicatorIcons from './callindicatoricons';
import { dropdownMotionProps, useCallTimer, useSyncedLocationInput, CallAgeSexComplaintRow, CallNotesAndLog, cardFieldClassNames, blurOnEnter } from './trackingcardparts';

type CallTrackingCardProps = {
  call: Call;
  callDisplayNumber: number;
  event: Event;
  onLocationChange: (callId: string, newLocation: string) => void;
  onAgeSexChange: (callId: string, ageSex: string) => void;
  onChiefComplaintChange: (callId: string, chiefComplaint: string) => void;
  onRemoveTeamFromCall: (callId: string, team: string) => Promise<void>;
  onAddTeamToCall: (callId: string, team: string) => Promise<void>;
  handleTeamStatusChange: (callId: string, team: string, newStatus: string, clinicId?: string) => void;
  onTransportToAmbulance: (callId: string, team: string) => void;
  handleRevertDetachment: (callId: string, team: string) => void;
  handleMarkDuplicate: (callId: string) => void;
  handleTogglePriority: (callId: string) => void;
  handleTogglePin: (callId: string) => void;
  handleDeleteCall: (callId: string) => void;
  formatAgeSex: (age?: string | number, gender?: string) => string;
  teamStatusMap: { [callId: string]: { [team: string]: string } };
  updateEvent: (updates: Partial<Event>) => Promise<void>;
};


export default function CallTrackingCard({
  call,
  callDisplayNumber,
  event,
  onLocationChange,
  onAgeSexChange,
  onChiefComplaintChange,
  onRemoveTeamFromCall,
  onAddTeamToCall,
  handleTeamStatusChange,
  onTransportToAmbulance,
  handleRevertDetachment,
  handleMarkDuplicate,
  handleTogglePriority,
  handleTogglePin,
  handleDeleteCall,
  formatAgeSex,
  teamStatusMap,
  updateEvent,
}: CallTrackingCardProps) {
  const { t } = useDispatchTerms();
  const clinics = getEventClinics(event.clinics);
  const isResolved = isCallResolved(call);
  const [clinicPickTeam, setClinicPickTeam] = useState<string | null>(null);
  // Which status opened the clinic picker — 'Transporting' or 'Delivered',
  // both of which need a destination clinic recorded when more than one exists.
  const [clinicPickStatus, setClinicPickStatus] = useState<string>('Transporting');
  const [expanded, setExpanded] = useState(false);
  const [locationInput, setLocationInput] = useSyncedLocationInput(call);
  const timer = useCallTimer(call);

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

  const locationOptions = useMemo(() => getVenueLocationOptions(event.venue), [event.venue]);

  // Get available teams for dropdown (including On Break and In Clinic)
  const availableStaff = useMemo(() => {
    return (event.staff || []).filter(s => 
      !call.assignedTeam?.includes(s.team)
    );
  }, [event.staff, call.assignedTeam]);

  const availableSupervisors = useMemo(() => {
    return (event.supervisor || []).filter(s => 
      !call.assignedTeam?.includes(s.team)
    );
  }, [event.supervisor, call.assignedTeam]);

  const availableEquipment = useMemo(() => {
    const equipmentItems = event.venue?.equipment || [];
    return equipmentItems
      .map(eq => typeof eq === 'string' ? eq : eq.name)
      .filter(equipName => !call.equipment?.includes(equipName));
  }, [event.venue?.equipment, call.equipment]);

  // Where each piece of equipment currently is — shown inline in the Add
  // Equipment menu so the dispatcher can pick the closest one. Live event
  // equipment wins over the venue's configured home location.
  const equipmentLocations = useMemo(() => {
    const locations = new Map<string, string>();
    (event.venue?.equipment || []).forEach(eq => {
      if (typeof eq !== 'string' && eq.location) locations.set(eq.name, eq.location);
    });
    (event.eventEquipment || []).forEach(eq => {
      if (eq.location) locations.set(eq.name, eq.location);
    });
    return locations;
  }, [event.venue?.equipment, event.eventEquipment]);

  // Get teams available for equipment delivery
  const teamsForEquipment = useMemo(() => {
    return (event.staff || []).filter(s => 
      ['Available', 'In Clinic', 'On Break'].includes(s.status)
    );
  }, [event.staff]);

  return (
    <Card
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-lg bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'}`}
    >
      {/* HEADER */}
      <CardHeader 
        onClick={() => setExpanded(v => !v)}
        className="relative flex items-center justify-between px-4 py-3 pb-0 cursor-pointer select-none"
      >
        <div className="text-[15px] sm:text-base font-semibold text-surface-light">
          Call {callDisplayNumber}
        </div>
        
        {/* Right section: Timer and Menu aligned horizontally */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {/* Timer */}
          <div className="text-[15px] sm:text-base font-semibold text-surface-light tabular-nums">
            {timer}
          </div>

          <CallIndicatorIcons call={call} />

          {/* 3-dot menu */}
          <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <Dropdown motionProps={dropdownMotionProps} placement="bottom-end" offset={6}>
              <DropdownTrigger>
                <button
                  className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
                  aria-label="Call actions"
                  type="button"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Call actions">
                <DropdownItem
                  key="showLog"
                  onPress={() => setExpanded(v => !v)}
                >
                  {expanded ? t('Hide Log') : t('Show Log')}
                </DropdownItem>
                <DropdownItem
                  key="duplicate"
                  onPress={() => handleMarkDuplicate(call.id)}
                >
                  {t('Mark as Duplicate')}
                </DropdownItem>
                <DropdownItem
                  key="priority"
                  isDisabled={!!call.clinic}
                  onPress={() => handleTogglePriority(call.id)}
                >
                  {call.priority ? t('Remove Priority') : t('Mark as Priority')}
                </DropdownItem>
                <DropdownItem
                  key="pin"
                  isDisabled={isResolved}
                  onPress={() => handleTogglePin(call.id)}
                >
                  {call.pin ? t('Unpin Call') : t('Pin Call')}
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  onPress={() => {
                    if (confirm('Are you sure you want to delete this call? This action cannot be undone.')) {
                      handleDeleteCall(call.id);
                    }
                  }}
                >
                  {t('Delete Call')}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </CardHeader>

      {/* BODY */}
      <CardBody className="px-4 pb-3 space-y-3">
        {/* Row 1: Location */}
        <div className="flex gap-2">
          <Autocomplete
            label="Location"
            labelPlacement="inside"
            inputValue={locationInput}
            onInputChange={(v) => setLocationInput(v)}
            onSelectionChange={(key) => {
              if (key) onLocationChange(call.id, key as string);
            }}
            onBlur={() => {
              if (locationInput !== call.location) {
                onLocationChange(call.id, locationInput);
              }
            }}
            onKeyDown={blurOnEnter}
            allowsCustomValue
            variant="flat"
            inputProps={{ classNames: cardFieldClassNames }}
            classNames={{ selectorButton: STATIC_SELECTOR_BUTTON_CLASS }}
            selectorButtonProps={staticSelectorButtonProps}
            className="flex-1"
          >
            {locationOptions.map((loc) => (
              <AutocompleteItem key={loc}>{loc}</AutocompleteItem>
            ))}
          </Autocomplete>
        </div>

        {/* Row 2: Age/Sex (1/4) + Chief Complaint (3/4) */}
        <CallAgeSexComplaintRow
          call={call}
          formatAgeSex={formatAgeSex}
          onAgeSexChange={onAgeSexChange}
          onChiefComplaintChange={onChiefComplaintChange}
        />

        {/* Row 3: Team tags + Add button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active assigned teams */}
          {(Array.isArray(call.assignedTeam) ? call.assignedTeam : []).map((team: string) => {
            const isEquipmentOnlyTeam = call.equipmentTeams?.includes(team);
            const statusOptions = isEquipmentOnlyTeam
              ? ['En Route Eq', 'Assisting', 'Delivered Eq']
              : ['En Route', 'On Scene', 'Unable to Locate', 'Transporting', 'Pending Transport', 'Rolled from Scene', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Detached'];
            
            // Same resolution desktop's CallTrackingTable uses: a per-call
            // override (teamStatusMap) takes priority over the team's own
            // current status, so the pill reflects and resets exactly like
            // the real call does.
            const currentStatus = teamStatusMap[call.id]?.[team] || event?.staff.find(s => s.team === team)?.status || 'En Route';
            const teamStatusColor = getStatusColor(currentStatus);

            // Equipment this team is actually running — used to swap the
            // pill's "Eq" suffix for the matching map icon, and to name the
            // specific item in the dropdown options and the activity log.
            const teamEquipment = isEquipmentOnlyTeam
              ? (event.eventEquipment || []).filter(eq => eq.assignedTeam === team)
              : [];
            const teamEquipmentNames = teamEquipment.map(eq => eq.name).join(', ');
            const teamEquipmentIconType = teamEquipment[0] ? getEquipmentIconType(teamEquipment[0].name) : null;
            const isEqStatus = currentStatus === 'Delivered Eq' || currentStatus === 'En Route Eq';
            // Reuses the chip's own translucent status fill on the status
            // button — stacked on top of the chip's already-tinted
            // background, the same semi-transparent token reads visibly
            // darker/more saturated, marking this piece out as a button
            // without introducing a whole new color.
            const statusButtonClass = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-surface-light ${teamStatusColor.fillClass} hover:brightness-110 transition-all`;

            return (
              <Chip
                key={team}
                size="lg"
                variant="flat"
                color="default"
                className={`text-surface-light h-9 ${teamStatusColor.chipClass}`}
                onClose={() => onRemoveTeamFromCall(call.id, team)}
              >
                <div className="flex items-center gap-2" data-testid={`team-chip-${team}`}>
                  <span className="font-medium">{team}</span>
                  {clinicPickTeam === team ? (
                    <Dropdown
                      motionProps={dropdownMotionProps}
                      placement="bottom-end"
                      offset={2}
                      isOpen
                      onOpenChange={(isOpen) => {
                        if (!isOpen) setClinicPickTeam(null);
                      }}
                    >
                      <DropdownTrigger>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className={statusButtonClass}
                        >
                          {t('Select clinic')} ▼
                        </button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="Select destination clinic"
                        onAction={(key) => {
                          setClinicPickTeam(null);
                          handleTeamStatusChange(call.id, team, clinicPickStatus, key as string);
                        }}
                      >
                        {clinics.map((clinic) => (
                          <DropdownItem key={clinic.id}>{clinic.name}</DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  ) : (
                    <Dropdown motionProps={dropdownMotionProps} placement="bottom-end" offset={2}>
                      <DropdownTrigger>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className={statusButtonClass}
                        >
                          {isEqStatus && teamEquipmentIconType ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{getEquipmentStatusWord(currentStatus)}</span>
                              <EquipmentTypeIcon type={teamEquipmentIconType} />
                            </span>
                          ) : (
                            <StatusLabel status={currentStatus} text={t(currentStatus)} />
                          )} ▼
                        </button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="Team Status"
                        onAction={(key) => {
                          // A destination picked when the team went Transporting carries over —
                          // Delivered only asks again if no clinic was chosen yet.
                          const transportClinicId = key === 'Delivered' ? getTransportClinicId(call, currentStatus, clinics) : undefined;
                          if (transportClinicId) {
                            handleTeamStatusChange(call.id, team, 'Delivered', transportClinicId);
                            return;
                          }
                          if ((key === 'Transporting' || key === 'Delivered') && clinics.length > 1) {
                            setClinicPickTeam(team);
                            setClinicPickStatus(key as string);
                            return;
                          }
                          if (key === 'Rolled from Scene') {
                            onTransportToAmbulance(call.id, team);
                            return;
                          }
                          handleTeamStatusChange(call.id, team, key as string, (key === 'Transporting' || key === 'Delivered') ? clinics[0]?.id : undefined);
                        }}
                      >
                        {statusOptions.map(status => (
                          <DropdownItem key={status}>
                            {(status === 'Delivered Eq' || status === 'En Route Eq') && teamEquipmentNames
                              ? `${status === 'En Route Eq' ? 'En Route -' : 'Delivered'} ${teamEquipmentNames}`
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
              className={`h-9 ${getStatusColor(detachedTeam.reason).chipClass}`}
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

          {/* Add Team Button — disabled once the call is resolved (delivered,
              refusal, nmm, unable to locate, transferred to ambulance); only
              reopening it via handleRevertDetachment re-enables this. */}
          <Dropdownmenu>
            <DropdownMenuTrigger asChild>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                aria-label="Add"
                isDisabled={isResolved}
                className="w-8 h-8 rounded-full hover:bg-surface-liner"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-surface-deep border-surface-liner text-surface-light">
              {/* Add Team Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                  {t('Add Team')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                  {availableStaff.length > 0 ? (
                    availableStaff.map(s => {
                      const isBreakOrClinic = ['On Break', 'In Clinic'].includes(s.status);
                      return (
                        <DropdownMenuItem
                          key={s.team}
                          onClick={() => onAddTeamToCall(call.id, s.team)}
                          className={`hover:bg-surface-liner focus:bg-surface-liner cursor-pointer ${
                            isBreakOrClinic ? 'bg-status-card-blue text-surface-light' : 'text-surface-light'
                          }`}
                        >
                          {s.team} {isBreakOrClinic && `(${t(s.status)})`}
                        </DropdownMenuItem>
                      );
                    })
                  ) : (
                    <DropdownMenuItem disabled className="text-surface-faint">
                      {t('No available teams')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Add Supervisor Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                  {t('Add Supervisor')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                  {availableSupervisors.length > 0 ? (
                    availableSupervisors.map(s => {
                      const isBreakOrClinic = ['On Break', 'In Clinic'].includes(s.status);
                      return (
                        <DropdownMenuItem
                          key={s.team}
                          onClick={() => onAddTeamToCall(call.id, s.team)}
                          className={`hover:bg-surface-liner focus:bg-surface-liner cursor-pointer ${
                            isBreakOrClinic ? 'bg-status-card-blue text-surface-light' : 'text-surface-light'
                          }`}
                        >
                          {s.team} {isBreakOrClinic && `(${t(s.status)})`}
                        </DropdownMenuItem>
                      );
                    })
                  ) : (
                    <DropdownMenuItem disabled className="text-surface-faint">
                      {t('No available supervisors')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Add Equipment Submenu - with team selection */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                  {t('Add Equipment')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                  {availableEquipment.length > 0 ? (
                    availableEquipment.map(equipName => (
                      <DropdownMenuSub key={equipName}>
                        <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer text-surface-light">
                          {equipName} ({t(equipmentLocations.get(equipName) || 'Unknown')})
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                          {teamsForEquipment.length > 0 ? (
                            teamsForEquipment.map(t => {
                              const isBreakOrClinic = ['On Break', 'In Clinic'].includes(t.status);
                              return (
                                <DropdownMenuItem
                                  key={t.team}
                                  onClick={async () => {
                                    const now = new Date();
                                    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

                                    // Find the equipment object in venue or event equipment
                                    const venueEquipment = event.venue?.equipment || [];
                                    const equipmentObj = venueEquipment.find(eq => 
                                      (typeof eq === 'string' ? eq : eq.name) === equipName
                                    );
                                    const equipmentId = typeof equipmentObj === 'object' ? equipmentObj.id : equipName;

                                    const updatedEquipment = event.eventEquipment?.map((eq) =>
                                      eq.id === equipmentId || eq.name === equipName
                                        ? {
                                            ...eq,
                                            status: 'In Use' as const,
                                            assignedTeam: t.team,
                                            location: call.location
                                          }
                                        : eq
                                    );

                                    const callLogEntry = {
                                      timestamp: now.getTime(),
                                      message: `${hhmm} - ${equipName} assigned to ${t.team} for this call.`
                                    };

                                    const teamLogEntry = {
                                      timestamp: now.getTime(),
                                      message: `${hhmm} - responding to call #${callDisplayNumber} with ${equipName}`
                                    };

                                    const updatedCall = {
                                      ...call,
                                      assignedTeam: [...(call.assignedTeam || []), t.team],
                                      equipment: [...(call.equipment || []), equipName],
                                      equipmentTeams: [...(call.equipmentTeams || []), t.team],
                                      status: 'Assigned',
                                      log: [...(call.log || []), callLogEntry]
                                    };

                                    const updatedStaff = event.staff.map((staff) =>
                                      staff.team === t.team
                                        ? {
                                            ...staff,
                                            status: 'En Route Eq',
                                            location: call.location,
                                            originalPost: staff.location || 'Unknown',
                                            log: [...(staff.log || []), teamLogEntry]
                                          }
                                        : staff
                                    );

                                    const updatedCalls = event.calls.map((c) =>
                                      c.id === call.id ? updatedCall : c
                                    );

                                    await updateEvent({
                                      calls: updatedCalls,
                                      staff: updatedStaff,
                                      eventEquipment: updatedEquipment
                                    });
                                  }}
                                  className={`hover:bg-surface-liner focus:bg-surface-liner cursor-pointer ${
                                    isBreakOrClinic ? 'bg-status-card-blue text-surface-light' : 'text-surface-light'
                                  }`}
                                >
                                  {t.team} {isBreakOrClinic && `(${t.status})`}
                                </DropdownMenuItem>
                              );
                            })
                          ) : (
                            <DropdownMenuItem disabled className="text-surface-faint">
                              No teams available
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))
                  ) : (
                    <DropdownMenuItem disabled className="text-surface-faint">
                      {t('No available equipment')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </Dropdownmenu>
        </div>

        <CallNotesAndLog
          call={call}
          callDisplayNumber={callDisplayNumber}
          event={event}
          updateEvent={updateEvent}
          expanded={expanded}
        />
      </CardBody>
    </Card>
  );
}
