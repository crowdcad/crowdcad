// calltrackingcard.tsx
'use client';

import React, { useState, useMemo } from 'react';
import CallRowFooters from './callrowfooter';
import { CallAddButton, CallAddMenuExtras, CallNumberMarks } from './callextras';
import {
  CardBody,
  Chip,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Autocomplete,
  AutocompleteItem,
} from '@heroui/react';
import { RotateCw } from '@/components/ui/icons';
import {
  Dropdownmenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Event, Call, DetachedTeam } from '@/app/types';
import StatusLabel, { getMenuLabel } from '@/components/dispatch/statuslabel';
import EquipmentTypeIcon, { getEquipmentStatusMenuLabel, getEquipmentStatusWord, isEquipmentIconStatus } from '@/components/dispatch/equipmenttypeicon';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { getEventClinics, getTransportClinicId, isCallResolved, getVenueLocationOptions } from '@/lib/clinics';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { TRACKING_RESOLVED_CHIP_CLASS, getStatusColor } from '@/lib/statusColors';
import { staticSelectorButtonProps } from '@/lib/heroStatic';
import CallIndicatorIcons from './callindicatoricons';
import { UnitPickerItems } from './unitpicker';
import { unitOptions } from '@/lib/unitDistance';
import { getEventVenueLayers } from '@/lib/zones';
import type { UnitTracking } from '@/lib/unitTracking';
import AddEquipmentSubmenu from './addequipmentmenu';
import { EQUIPMENT_RUN_STATUSES, equipmentOfUnit, fleetOf } from '@/lib/equipmentCustody';
import { dropdownMotionProps, pinCallPatch, useCallTimer, useSyncedLocationInput, CallAgeSexComplaintRow, CallNotesAndLog, cardFieldClassNames, blurOnEnter } from './trackingcardparts';
import TrackingCardShell, { type TrackingCardAction } from './trackingcardshell';
import PinDropModal, { firstGeoLayer } from '@/components/geo/PinDropModal';
import StatusCodeKeys from './statuscodekeys';
import { codeForStatus } from '@/lib/statusCodes';

type CallTrackingCardProps = {
  call: Call;
  callDisplayNumber: number;
  event: Event;
  onLocationChange: (callId: string, newLocation: string) => void;
  onAgeSexChange: (callId: string, ageSex: string) => void;
  onChiefComplaintChange: (callId: string, chiefComplaint: string) => void;
  onRemoveTeamFromCall: (callId: string, team: string) => Promise<void>;
  onAddTeamToCall: (callId: string, team: string) => Promise<void>;
  /** Live unit positions (an extension pack's), for distances in Add Team / Add Supervisor. */
  unitTracking?: UnitTracking | null;
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
  unitTracking,
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
  const [statusMenuTeam, setStatusMenuTeam] = useState<string | null>(null);
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

  const venueLayers = getEventVenueLayers(event);
  const [pinOpen, setPinOpen] = useState(false);

  const cardActions: TrackingCardAction[] = [
    { key: 'duplicate', label: t('Mark as Duplicate'), onPress: () => handleMarkDuplicate(call.id) },
    { key: 'priority', label: call.priority ? t('Remove Priority') : t('Mark as Priority'), isDisabled: !!call.clinic, onPress: () => handleTogglePriority(call.id) },
    { key: 'pin', label: call.pin ? t('Unpin Call') : t('Pin Call'), isDisabled: isResolved, onPress: () => handleTogglePin(call.id) },
    ...(firstGeoLayer(venueLayers) ? [{ key: 'drop-pin', label: call.locationPoint ? t('Move pin') : t('Drop pin'), onPress: () => setPinOpen(true) }] : []),
      {
        key: 'delete',
        label: t('Delete Call'),
        danger: true,
        onPress: () => {
          if (confirm('Are you sure you want to delete this call? This action cannot be undone.')) handleDeleteCall(call.id);
        },
      },
  ];
  return (
    <TrackingCardShell
      testId={`call-card-${callDisplayNumber}`}
      title={
        <span className="inline-flex items-center gap-1">
          {`${t('Call')} ${callDisplayNumber}`}
          <CallNumberMarks call={call} />
        </span>
      }
      timer={timer}
      indicators={<CallIndicatorIcons call={call} />}
      actions={cardActions}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      resolved={isResolved}
    >

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
              ? EQUIPMENT_RUN_STATUSES
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
              ? equipmentOfUnit(fleetOf(event), event, team)
              : [];
            const teamEquipmentNames = teamEquipment.map(eq => eq.name).join(', ');
            const teamEquipmentIconType = teamEquipment[0] ? getEquipmentIconType(teamEquipment[0].name) : null;
            const isEqStatus = isEquipmentIconStatus(currentStatus);
            // Reuses the chip's own translucent status fill on the status
            // button — stacked on top of the chip's already-tinted
            // background, the same semi-transparent token reads visibly
            // darker/more saturated, marking this piece out as a button
            // without introducing a whole new color.
            const statusButtonClass = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-surface-light ${teamStatusColor.fillClass} hover:brightness-110 transition-all`;
            const pickTeamStatus = (key: string) => {
              // A destination picked when the team went Transporting carries over —
              // Delivered only asks again if no clinic was chosen yet.
              const transportClinicId = key === 'Delivered' ? getTransportClinicId(call, currentStatus, clinics) : undefined;
              if (transportClinicId) {
                handleTeamStatusChange(call.id, team, 'Delivered', transportClinicId);
                return;
              }
              if ((key === 'Transporting' || key === 'Delivered') && clinics.length > 1) {
                setClinicPickTeam(team);
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
                className={`text-surface-light h-9 ${teamStatusColor.chipClass} ${isResolved ? TRACKING_RESOLVED_CHIP_CLASS : ''}`}
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
                    <Dropdown
                      motionProps={dropdownMotionProps}
                      placement="bottom-end"
                      offset={2}
                      isOpen={statusMenuTeam === team}
                      onOpenChange={(isOpen) => setStatusMenuTeam(isOpen ? team : null)}
                    >
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
                        // Typing a status code (UTL, NMM, AMA) picks it too.
                        topContent={
                          <StatusCodeKeys
                            options={statusOptions}
                            onPick={(status) => {
                              setStatusMenuTeam(null);
                              pickTeamStatus(status);
                            }}
                          />
                        }
                        onAction={(key) => pickTeamStatus(key as string)}
                      >
                        {statusOptions.map(status => (
                          <DropdownItem key={status} shortcut={codeForStatus(status)}>
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
              className={`h-9 ${getStatusColor(detachedTeam.reason).chipClass} ${isResolved ? TRACKING_RESOLVED_CHIP_CLASS : ''}`}
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
              <CallAddButton call={call} disabled={isResolved} className={isResolved ? TRACKING_RESOLVED_CHIP_CLASS : ''} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-surface-deep border-surface-liner text-surface-light">
              <CallAddMenuExtras call={call} />
              {/* Add Team Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                  {t('Add Team')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                  <UnitPickerItems
                    options={unitOptions(event, call, 'team', venueLayers, unitTracking)}
                    onPick={(team) => onAddTeamToCall(call.id, team)}
                    emptyLabel={t('No available teams')}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Add Supervisor Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
                  {t('Add Supervisor')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                  <UnitPickerItems
                    options={unitOptions(event, call, 'supervisor', venueLayers, unitTracking)}
                    onPick={(team) => onAddTeamToCall(call.id, team)}
                    emptyLabel={t('No available supervisors')}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <AddEquipmentSubmenu call={call} event={event} callNumber={callDisplayNumber} updateEvent={updateEvent} layers={venueLayers} tracking={unitTracking} />
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
        {/* Last, so it leaves no gap while empty. */}
        <CallRowFooters call={call} />
      </CardBody>
      <PinDropModal
        isOpen={pinOpen}
        onClose={() => setPinOpen(false)}
        layers={venueLayers}
        initial={call.locationPoint}
        onPick={(pin) => void updateEvent(pinCallPatch(event, call.id, pin))}
      />
    </TrackingCardShell>
  );
}
