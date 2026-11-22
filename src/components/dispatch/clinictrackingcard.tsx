// clinictrackingcard.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  CardBody,
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import { RotateCw } from 'lucide-react';
import type { Event, Call } from '@/app/types';
import StatusLabel, { getMenuLabel } from '@/components/dispatch/statuslabel';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { isClinicCallResolved } from '@/lib/clinics';
import CallIndicatorIcons from './callindicatoricons';
import { dropdownMotionProps, useCallTimer, useSyncedLocationInput, CallAgeSexComplaintRow, CallNotesAndLog, blurOnEnter } from './trackingcardparts';

import TrackingCardShell, { type TrackingCardAction } from './trackingcardshell';

type ClinicTrackingCardProps = {
  call: Call;
  callDisplayNumber: number;
  event: Event;
  onLocationChange: (callId: string, newLocation: string) => void;
  onAgeSexChange: (callId: string, ageSex: string) => void;
  onChiefComplaintChange: (callId: string, chiefComplaint: string) => void;
  onOutcomeChange: (callId: string, outcome: string) => void;
  onRevertOutcome: (callId: string) => void;
  handleDeleteCall: (callId: string) => void;
  handleTogglePin: (callId: string) => void;
  formatAgeSex: (age?: string | number, gender?: string) => string;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
};

export default function ClinicTrackingCard({
  call,
  callDisplayNumber,
  event,
  onLocationChange,
  onAgeSexChange,
  onChiefComplaintChange,
  onOutcomeChange,
  onRevertOutcome,
  handleDeleteCall,
  handleTogglePin,
  formatAgeSex,
  updateEvent,
}: ClinicTrackingCardProps) {
  const { t } = useDispatchTerms();
  const [expanded, setExpanded] = useState(false);
  const [locationInput, setLocationInput] = useSyncedLocationInput(call);
  const timer = useCallTimer(call);
  const isResolved = isClinicCallResolved(call);

  // Get primary team (first assigned team or first detached team)
  const primaryTeam = useMemo(() => {
    if (call.assignedTeam && call.assignedTeam.length > 0) {
      return Array.isArray(call.assignedTeam) ? call.assignedTeam[0] : call.assignedTeam;
    }
    if (call.detachedTeams && call.detachedTeams.length > 0) {
      return call.detachedTeams[0].team;
    }
    // No team: where they came from (Walkup, or MCI: <team or zone> for a patient the MCI handed over).
    return call.source || 'Walkup';
  }, [call.assignedTeam, call.detachedTeams, call.source]);

  const cardActions: TrackingCardAction[] = [
    { key: 'pin', label: call.pin ? t('Unpin Call') : t('Pin Call'), isDisabled: isResolved, onPress: () => handleTogglePin(call.id) },
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
      title={`${t('Call')} ${callDisplayNumber}`}
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
          <Input
            label={t('Location')}
            labelPlacement="inside"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onBlur={() => {
              if (locationInput !== call.location) {
                onLocationChange(call.id, locationInput);
              }
            }}
            onKeyDown={blurOnEnter}
            variant="flat"
            classNames={{
              input: "text-surface-light bg-surface-deep outline-none focus:outline-none data-[focus=true]:outline-none",
              inputWrapper: "bg-surface-deep shadow-none hover:bg-surface-deep group-data-[focus=true]:bg-surface-deep border border-surface-liner"
            }}
            className="flex-1"
          />
        </div>

        {/* Row 2: Age/Sex (1/4) + Chief Complaint (3/4) */}
        <CallAgeSexComplaintRow
          call={call}
          formatAgeSex={formatAgeSex}
          onAgeSexChange={onAgeSexChange}
          onChiefComplaintChange={onChiefComplaintChange}
        />

        {/* Row 3: Status (left half) + Primary Team (right half) */}
        <div className="flex gap-2">
          {/* Status Dropdown */}
          <div className="flex-1" onClick={e => e.stopPropagation()}>
            <Dropdown motionProps={dropdownMotionProps} isOpen={isResolved ? false : undefined}>
              <DropdownTrigger>
                <Button
                  variant="flat"
                  radius="md"
                  isDisabled={isResolved}
                  className={`w-full h-full justify-start bg-surface-deep border border-surface-liner text-surface-light px-2 ${isResolved ? 'opacity-100 cursor-default' : 'hover:bg-surface-muted'}`}
                >
                  <div className="text-left flex-4 pl-0.5">
                    <div className="text-xs text-surface-faint pb-0.5">{t('Status')}</div>
                    <div className="text-sm">
                      <StatusLabel status={call.outcome || 'In Clinic'} text={t(call.outcome || 'In Clinic')} />
                    </div>
                  </div>
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Clinic Status"
                onAction={(key) => onOutcomeChange(call.id, key as string)}
              >
                <DropdownItem key="In Clinic">{t('In Clinic')}</DropdownItem>
                <DropdownItem key="Pending Transport">{getMenuLabel('Pending Transport', t)}</DropdownItem>
                <DropdownItem key="Transported">{getMenuLabel('Transported', t)}</DropdownItem>
                <DropdownItem key="AMA">{t('AMA')}</DropdownItem>
                <DropdownItem key="Discharged">{t('Discharged')}</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>

          {call.outcome && call.outcome !== 'Pending Transport' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRevertOutcome(call.id); }}
              className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center shrink-0 px-1"
              aria-label={t('Reopen Call')}
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}

          {/* Primary Team (read-only) */}
          <div className="flex-1">
            <div className="h-full px-2.5 py-2 bg-surface-deep border border-surface-liner rounded-xl flex flex-col justify-center">
              <div className="text-xs text-surface-faint mb-0.5">{t('Primary Team')}</div>
              <div className="text-sm">{t(primaryTeam)}</div>
            </div>
          </div>
        </div>

        <CallNotesAndLog
          call={call}
          callDisplayNumber={callDisplayNumber}
          event={event}
          updateEvent={updateEvent}
          expanded={expanded}
        />
      </CardBody>
    </TrackingCardShell>
  );
}
