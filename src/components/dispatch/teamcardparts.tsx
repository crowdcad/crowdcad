'use client';

// Building blocks shared by TeamCard (normal) and TeamCardCondensed. The two
// cards only differ in layout — status/location controls, the actions menu,
// the map button, member formatting and the activity log all live here so a
// fix in one can't silently miss the other.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Select, SelectItem, Autocomplete, AutocompleteItem, Button,
} from '@heroui/react';
import { MapPin, MoreVertical, Map as MapIcon, Radio } from 'lucide-react';
import type { Clinic, Event, Staff } from '@/app/types';
import TrackingTextEntry from '@/components/dispatch/trackingtextentry';
import { deriveTeamVisualStatus, getStatusColor } from '@/lib/statusColors';
import StatusLabel from './statuslabel';
import EquipmentTypeIcon, { getEquipmentStatusWord } from './equipmenttypeicon';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { getEventClinics } from '@/lib/clinics';
import { getEquipmentIconType, type EquipmentIconType } from '@/lib/equipmentIcon';
import { textToLog } from '@/lib/logText';
import { parseTimeToMinutes } from '@/lib/postingTimes';

export type TeamCardProps = {
  staff: Staff;
  event: Event;
  sinceMs?: number;
  onStatusChange: (staff: Staff, newStatus: string, clinicId?: string) => void;
  onLocationChange: (staff: Staff, newLocation: string) => void;
  onEdit?: (staff: Staff) => void;
  onDelete?: (teamName: string) => void;
  onRefreshPost?: (teamName: string) => void;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  /** Opens the Add Call modal pre-filled with this team/supervisor as the assigned team. */
  onNewCall?: (teamName: string) => void;
  /** Whether the venue has a map uploaded — gates the "view on map" button. */
  hasVenueMap?: boolean;
  onViewOnMap?: (teamName: string) => void;
  /** Whether this team's current location is an actual pin on the map — the button still shows, but disabled, when it's a free-text/non-post value like Roaming or an unrecognized location. */
  canLocateOnMap?: boolean;
  /** Location comes from live tracking (a connected TAK device) and can't be edited (D66). */
  locationTracked?: boolean;
  /** Edits this team's post for one posting time; when given, the card lists the team's posts (TAK events with a schedule, D66). */
  onPostAssignment?: (time: string, post: string, team: string) => void;
};

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

const isEquipmentStatus = (status: string) => status === 'Delivered Eq' || status === 'En Route Eq';

export type TeamStatusModel = {
  statusOptions: string[];
  teamEquipmentNames: string;
  teamEquipmentIconType: EquipmentIconType | null;
  statusTone: ReturnType<typeof getStatusColor>;
  clinics: Clinic[];
};

/** Which statuses a team can move to right now, plus the display bits derived alongside. */
export function useTeamStatusModel(staff: Staff, event: Event): TeamStatusModel {
  const isOnAnyActiveCall = !!event.calls?.some(c =>
    c.assignedTeam?.includes(staff.team) && !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release'].includes(c.status)
  );

  const isOnEq = !!event.calls?.some(c =>
    c.equipmentTeams?.includes(staff.team) && !['Resolved', 'Delivered Eq', 'Refusal', 'NMM', 'Treat and Release'].includes(c.status)
  ) || ['En Route Eq', 'Assisting'].includes(staff.status);

  const statusOptions = isOnEq
    ? ['En Route Eq', 'Assisting', 'Delivered Eq']
    : isOnAnyActiveCall
      ? ['En Route', 'On Scene', 'Transporting', 'Pending Transport']
      : ['Available', 'On Break', 'In Clinic'];

  // Equipment this team/supervisor is actually running — same icon
  // convention as the call tracker's team chip (see equipmenttypeicon.tsx).
  const teamEquipment = isOnEq
    ? (event.eventEquipment || []).filter(eq => eq.assignedTeam === staff.team)
    : [];

  return {
    statusOptions,
    teamEquipmentNames: teamEquipment.map(eq => eq.name).join(', '),
    teamEquipmentIconType: teamEquipment[0] ? getEquipmentIconType(teamEquipment[0].name) : null,
    statusTone: getStatusColor(deriveTeamVisualStatus(staff.status, event, staff.team)),
    clinics: getEventClinics(event.clinics),
  };
}

/** Status word for the card, with the equipment icon for equipment runs. */
export function TeamStatusText({ status, iconType }: { status: string; iconType: EquipmentIconType | null }) {
  const { t } = useDispatchTerms();
  if (isEquipmentStatus(status) && iconType) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        <span className="truncate">{getEquipmentStatusWord(status)}</span>
        <EquipmentTypeIcon type={iconType} />
      </span>
    );
  }
  // Icon-aware for any other status (Transporting, Pending Transport, etc. —
  // see STATUS_ICONS); the destination clinic name lives in the log now, not
  // the pill.
  return <StatusLabel status={status} text={t(status)} />;
}

export function TeamStatusSelect({
  staff,
  event,
  model,
  onStatusChange,
  onLocationChange,
}: {
  staff: Staff;
  event: Event;
  model: TeamStatusModel;
  onStatusChange: TeamCardProps['onStatusChange'];
  onLocationChange: TeamCardProps['onLocationChange'];
}) {
  const { t } = useDispatchTerms();
  const { statusOptions, teamEquipmentNames, teamEquipmentIconType, statusTone, clinics } = model;
  const [showClinicPicker, setShowClinicPicker] = useState(false);
  const lastValidLocation = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (staff.location && staff.location !== 'Clinic') {
      lastValidLocation.current = staff.location;
    }
  }, [staff.location]);

  const pillClass = `${statusTone.fillClass} text-surface-light border ${statusTone.borderClass} rounded-full transition-colors`;

  if (showClinicPicker) {
    return (
      <Dropdown isOpen onOpenChange={(isOpen) => { if (!isOpen) setShowClinicPicker(false); }}>
        <DropdownTrigger>
          <Button size="sm" className={`w-full min-w-0 justify-start ${pillClass}`}>
            {t('Select clinic')}
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Select destination clinic"
          onAction={(key) => {
            setShowClinicPicker(false);
            onStatusChange(staff, 'Transporting', key as string);
          }}
        >
          {clinics.map((clinic) => (
            <DropdownItem key={clinic.id}>{clinic.name}</DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    );
  }

  return (
    <Select
      aria-label="Status"
      selectedKeys={new Set([staff.status ?? ''])}
      onSelectionChange={(keys) => {
        const val = Array.from(keys as Set<string>)[0] || '';
        if (!val) return;
        // On a live-tracking event Location is where the team is, so a status change never moves it (D66).
        if (val === 'Available' && event.mapMode !== 'tak') {
          const targetLocation =
            staff.originalPost ||
            event.pendingAssignments?.[staff.team]?.post ||
            lastValidLocation.current;

          if (targetLocation && targetLocation !== staff.location) {
            onLocationChange(staff, targetLocation);
          } else if (staff.location === 'Clinic') {
            onLocationChange(staff, '');
          }
        }
        if (val === 'Transporting' && clinics.length > 1) {
          setShowClinicPicker(true);
          return;
        }
        onStatusChange(staff, val, val === 'Transporting' ? clinics[0]?.id : undefined);
      }}
      renderValue={(items) => {
        const key = items[0]?.key as string | undefined;
        return key ? <TeamStatusText status={key} iconType={teamEquipmentIconType} /> : null;
      }}
      classNames={{ base: 'min-w-0', trigger: pillClass }}
    >
      {statusOptions.map((s) => (
        <SelectItem key={s}>
          {isEquipmentStatus(s) && teamEquipmentNames
            ? `${s === 'En Route Eq' ? 'En Route -' : 'Delivered'} ${teamEquipmentNames}`
            : t(s)}
        </SelectItem>
      ))}
    </Select>
  );
}

/** Read-only Location while live tracking writes it (D66), shaped like the editable field. */
function TrackedLocation({ location }: { location: string }) {
  const { t } = useDispatchTerms();
  return (
    <div
      className="flex h-8 min-w-0 items-center gap-1 rounded-full border border-surface-liner bg-surface-deep px-3 text-sm text-surface-light"
      title={`${location || t('No location')} (live from TAK; not editable while connected)`}
      aria-label="Location (live)"
    >
      <Radio className="h-[18px] w-[18px] shrink-0 text-status-green" aria-hidden />
      <span className="min-w-0 truncate pl-1">{location || t('No location')}</span>
    </div>
  );
}

export function TeamLocationInput({
  staff,
  event,
  onLocationChange,
  tracked,
}: {
  staff: Staff;
  event: Event;
  onLocationChange: TeamCardProps['onLocationChange'];
  tracked?: boolean;
}) {
  if (tracked) return <TrackedLocation location={staff.location} />;
  return <EditableTeamLocation staff={staff} event={event} onLocationChange={onLocationChange} />;
}

function EditableTeamLocation({
  staff,
  event,
  onLocationChange,
}: {
  staff: Staff;
  event: Event;
  onLocationChange: TeamCardProps['onLocationChange'];
}) {
  const { t } = useDispatchTerms();
  const [locationInput, setLocationInput] = useState(staff.location || '');
  useEffect(() => {
    setLocationInput(staff.location || '');
  }, [staff.location]);

  const postOptions = useMemo(() => {
    const posts = (event.venue?.posts || []).map(p => (typeof p === 'string' ? p : p.name));
    return Array.from(new Set(['Clinic', ...posts]));
  }, [event.venue?.posts]);

  const commitTypedValue = () => {
    const value = locationInput.trim();
    if (value && value !== staff.location) onLocationChange(staff, value);
    return value;
  };

  return (
    <Autocomplete
      aria-label="Location"
      startContent={(
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <MapPin className="h-[18px] w-[18px] shrink-0 text-surface-faint" />
        </span>
      )}
      inputValue={locationInput}
      onInputChange={setLocationInput}
      onSelectionChange={(key) => {
        if (key) onLocationChange(staff, key as string);
      }}
      onKeyDown={(e) => {
        // Enter commits a custom (non-listed) value.
        if (e.key === 'Enter') commitTypedValue();
      }}
      onBlur={() => {
        // Clicking away commits a custom value; clearing the field clears the location.
        if (!commitTypedValue()) onLocationChange(staff, '');
      }}
      allowsCustomValue
      className="min-w-0"
      classNames={{
        base: 'min-w-0 data-[focus-visible=true]:outline-none data-[focus=true]:outline-none',
        // HeroUI lays the clear (x) button out as a real flex sibling of the
        // input (not an overlay), so its width — reserved even while
        // invisible pre-hover — was eating into the input's own width well
        // before the text reached the dropdown chevron. Taking it out of flow
        // and overlaying it instead frees that space for text, which can now
        // run underneath it exactly like the "clear" button does everywhere
        // else in this app.
        clearButton: 'absolute end-6 top-1/2 -translate-y-1/2',
      }}
      inputProps={{
        classNames: {
          inputWrapper: 'bg-surface-deep text-surface-light border border-surface-liner rounded-full pl-3 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0 data-[focus-visible=true]:ring-0 data-[focus-visible=true]:ring-offset-0 focus-within:ring-0 focus:ring-0',
          input: 'bg-surface-deep pl-1 pe-0 !pe-0 w-full min-w-0 truncate data-[has-end-content=true]:pe-0 group-data-[has-end-content=true]:pe-0 data-[focus-visible=true]:ring-0 focus:ring-0 focus-visible:ring-0 outline-none focus:outline-none data-[focus=true]:outline-none',
        },
      }}
    >
      {postOptions.map(p => (
        <AutocompleteItem key={p}>{t(p)}</AutocompleteItem>
      ))}
    </Autocomplete>
  );
}

/** Status + location controls row. Clicks here must not toggle the card. */
export function TeamControlsRow(props: {
  staff: Staff;
  event: Event;
  model: TeamStatusModel;
  onStatusChange: TeamCardProps['onStatusChange'];
  onLocationChange: TeamCardProps['onLocationChange'];
  locationTracked?: boolean;
}) {
  const { locationTracked, ...statusProps } = props;
  return (
    <div className="flex items-center gap-3">
      <div onClick={stopPropagation} onKeyDown={stopPropagation} className="min-w-0 flex-[1]">
        <TeamStatusSelect {...statusProps} />
      </div>
      <div onClick={stopPropagation} onKeyDown={stopPropagation} className="min-w-0 flex-[1.5]">
        <TeamLocationInput staff={props.staff} event={props.event} onLocationChange={props.onLocationChange} tracked={locationTracked} />
      </div>
    </div>
  );
}

const iconButtonClass =
  'p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center';

export function TeamMapButton({ staff, canLocateOnMap, onViewOnMap }: Pick<TeamCardProps, 'staff' | 'canLocateOnMap' | 'onViewOnMap'>) {
  return (
    <button
      type="button"
      disabled={!canLocateOnMap}
      onClick={(e) => {
        e.stopPropagation();
        if (!canLocateOnMap) return;
        onViewOnMap?.(staff.team);
      }}
      className={`${iconButtonClass} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-surface-light`}
      aria-label="View on map"
      title={canLocateOnMap ? 'View on map' : `${staff.location || 'This location'} isn't on the map`}
    >
      <MapIcon className="h-4 w-4" />
    </button>
  );
}

export function TeamActionsMenu({ staff, onEdit, onDelete, onRefreshPost, onNewCall }: Pick<TeamCardProps, 'staff' | 'onEdit' | 'onDelete' | 'onRefreshPost' | 'onNewCall'>) {
  const { t } = useDispatchTerms();
  return (
    <div onClick={stopPropagation} onKeyDown={stopPropagation}>
      <Dropdown placement="bottom-end" offset={6}>
        <DropdownTrigger>
          <button className={iconButtonClass} aria-label="Team actions" type="button">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Team actions"
          itemClasses={{ base: 'px-3 py-2 text-sm text-surface-light rounded-xl' }}
          onAction={(key) => {
            if (key === 'refresh') onRefreshPost?.(staff.team);
            if (key === 'newCall') onNewCall?.(staff.team);
            if (key === 'edit') onEdit?.(staff);
            if (key === 'delete') onDelete?.(staff.team);
          }}
        >
          <DropdownItem key="newCall">{t('New Call')}</DropdownItem>
          <DropdownItem key="refresh">{t('Refresh Post')}</DropdownItem>
          <DropdownItem key="edit">{t('Edit')}</DropdownItem>
          <DropdownItem key="delete" className="text-status-red">{t('Delete')}</DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
}

/** "Name [Cert] [Cert2] [Lead]" from a stored member string like "Name [Cert] (Lead)". */
export function formatMemberLine(member: string, t: (key: string) => string) {
  const isLead = member.includes('(Lead)');
  const withoutLead = member.replace(/\s*\(Lead\)\s*/g, '').trim();
  const certMatches = [...withoutLead.matchAll(/\[(.+?)\]/g)].map(match => match[1]).filter(Boolean);
  const name = withoutLead.replace(/\s*\[.+?\]/g, '').trim();
  const certText = certMatches.map(cert => `[${cert}]`).join(' ');
  const leadText = isLead ? ` [${t('Lead')}]` : '';
  return `${name}${certText ? ` ${certText}` : ''}${leadText}`.trim();
}

export function TeamMemberList({ staff, className }: { staff: Staff; className?: string }) {
  const { t } = useDispatchTerms();
  const memberLines = useMemo(() => {
    const members = Array.isArray(staff.members) ? staff.members : [];
    return members
      .filter((member): member is string => typeof member === 'string' && member.trim().length > 0)
      .map(member => formatMemberLine(member, t));
  }, [staff.members, t]);

  return (
    <div className={className}>
      {memberLines.map((line, index) => (
        <div key={`${staff.team}-member-${index}`} className="text-xs text-surface-faint truncate">
          {line}
        </div>
      ))}
      {memberLines.length === 0 && (
        <div className="text-xs text-surface-faint italic">{t('No members')}</div>
      )}
    </div>
  );
}

export interface TeamPostSlot {
  time: string;
  /** The next posting time, where this one's shift ends (none for the last). */
  until?: string;
  post: string | null;
}

/** A team's post for each posting time, in time order (D66). */
export function teamPostSlots(event: Pick<Event, 'postingTimes' | 'postAssignments'>, team: string): TeamPostSlot[] {
  const times = [...(event.postingTimes || [])]
    .filter((time) => parseTimeToMinutes(time) !== null)
    .sort((a, b) => parseTimeToMinutes(a)! - parseTimeToMinutes(b)!);
  return times.map((time, i) => {
    const slot = event.postAssignments?.[time] || {};
    return { time, until: times[i + 1], post: Object.keys(slot).find((p) => slot[p] === team) ?? null };
  });
}

const UNASSIGNED_POST = '__unassigned__';

/**
 * The team's posts by posting time, styled like the member list beside it,
 * each editable (a click picks another post). Posts follow the posting
 * schedule; the team's Location is tracked separately (D66).
 */
export function TeamPostSchedule({
  staff,
  event,
  onPostAssignment,
  className,
  alignRight,
}: {
  staff: Staff;
  event: Event;
  onPostAssignment: NonNullable<TeamCardProps['onPostAssignment']>;
  className?: string;
  alignRight?: boolean;
}) {
  const { t } = useDispatchTerms();
  const slots = useMemo(() => teamPostSlots(event, staff.team), [event, staff.team]);
  const posts = useMemo(
    () => Array.from(new Set((event.eventPosts || []).map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean))),
    [event.eventPosts]
  );

  return (
    <div className={className}>
      {slots.map((slot) => (
        <Dropdown key={slot.time} placement={alignRight ? 'bottom-end' : 'bottom-start'}>
          <DropdownTrigger>
            <button
              type="button"
              className={`block w-full truncate text-xs text-surface-faint hover:text-surface-light ${alignRight ? 'text-right' : 'text-left'}`}
              aria-label={`Post from ${slot.time}: ${slot.post ?? 'unassigned'}. Change`}
            >
              {slot.post ? t(slot.post) : t('Unassigned')} ({slot.time}{slot.until ? `–${slot.until}` : '+'})
            </button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label={`Post from ${slot.time}`}
            selectionMode="single"
            selectedKeys={new Set([slot.post ?? UNASSIGNED_POST])}
            className="max-h-64 overflow-y-auto"
            onAction={(key) => {
              const post = key === UNASSIGNED_POST ? null : (key as string);
              if (post === slot.post) return;
              if (post) onPostAssignment(slot.time, post, staff.team);
              else if (slot.post) onPostAssignment(slot.time, slot.post, '');
            }}
          >
            {[
              <DropdownItem key={UNASSIGNED_POST}>{t('Unassigned')}</DropdownItem>,
              ...posts.map((p) => <DropdownItem key={p}>{t(p)}</DropdownItem>),
            ]}
          </DropdownMenu>
        </Dropdown>
      ))}
      {slots.length === 0 && <div className="text-xs text-surface-faint italic">{t('No posting times')}</div>}
    </div>
  );
}

const joinLog = (log: Staff['log']) =>
  log && log.length > 0 ? log.map(entry => entry.message).join('\n') : '';

export function TeamActivityLog({
  staff,
  event,
  updateEvent,
  compact,
}: Pick<TeamCardProps, 'staff' | 'event' | 'updateEvent'> & { compact?: boolean }) {
  const { t } = useDispatchTerms();
  // Persistent local state for log text — never goes null to prevent flicker.
  const [logText, setLogText] = useState(() => joinLog(staff.log));
  const logFocusedRef = useRef(false);
  // Sync log text from props when not focused (prevents overwriting user edits).
  useEffect(() => {
    if (!logFocusedRef.current) setLogText(joinLog(staff.log));
  }, [staff.log]);

  return (
    <TrackingTextEntry
      mode="log"
      value={logText}
      onChange={(e) => setLogText(e.target.value)}
      onBlur={async () => {
        logFocusedRef.current = false;
        // Convert text back to log entries, keeping unchanged lines' timestamps.
        const newLog = textToLog(logText, staff.log);
        if (!newLog) return;
        const updatedStaff = event.staff.map(s => (s.team === staff.team ? { ...s, log: newLog } : s));
        await updateEvent({ staff: updatedStaff });
      }}
      onFocus={() => {
        logFocusedRef.current = true;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const now = new Date();
          const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
          setLogText(prev => prev + `\n${hhmm} - `);
        }
      }}
      minRows={compact ? 3 : 4}
      maxRows={compact ? 4 : 5}
      variant="flat"
      placeholder={t('No log entries')}
      className="min-w-0"
      classNames={compact ? { input: 'text-xs' } : undefined}
    />
  );
}
