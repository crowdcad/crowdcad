// equipmentcard.tsx

'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Card, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Select, SelectItem, Autocomplete, AutocompleteItem
} from '@heroui/react';
import { ChevronDown, ChevronUp, MapPin, MoreVertical, Map as MapIcon } from 'lucide-react';
import type { Event, EquipmentItem } from '@/app/types';
import TrackingTextEntry from '@/components/dispatch/trackingtextentry';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { getStatusColor } from '@/lib/statusColors';
import EquipmentTypeIcon from '@/components/dispatch/equipmenttypeicon';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { STATIC_SELECTOR_BUTTON_CLASS, staticSelectorButtonProps } from '@/lib/autocompleteSelector';

type EquipmentCardProps = {
  equipment: EquipmentItem;
  event: Event;
  onStatusChange: (equipmentName: string, newStatus: string) => void;
  onLocationChange: (equipmentName: string, newLocation: string) => void;
  onMarkReady?: (equipmentName: string) => void;
  onDelete?: (equipmentName: string) => void;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  /** Whether the venue has a map uploaded — gates the "view on map" button. */
  hasVenueMap?: boolean;
  onViewOnMap?: (equipmentName: string) => void;
  /** Whether this item's current location is an actual pin on the map — the button still shows, but disabled, when it's a free-text/non-post value or unset. */
  canLocateOnMap?: boolean;
};

// Shares statusColors.ts's team/supervisor status→color convention
// (Available -> green, In Clinic -> blue, etc.) instead of a separate
// hand-rolled mapping — equipment's two statuses with no team-status
// equivalent ("In Use" and "Call N", both meaning "away on a call") map
// onto the same red family team's own En Route/On Scene/Transporting use.
function equipmentStatusTone(status: string) {
  if (status.startsWith('Call ') || status === 'In Use') {
    return getStatusColor('En Route');
  }
  return getStatusColor(status);
}

export default function EquipmentCard({
  equipment,
  event,
  onStatusChange,
  onLocationChange,
  onMarkReady,
  onDelete,
  updateEvent,
  hasVenueMap,
  onViewOnMap,
  canLocateOnMap,
}: EquipmentCardProps) {
  const { t } = useDispatchTerms();
  const [expanded, setExpanded] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [notesText, setNotesText] = useState(equipment.notes || '');
  const notesFocusedRef = useRef(false);

  useEffect(() => {
    if (!notesFocusedRef.current) {
      setNotesText(equipment.notes || '');
    }
  }, [equipment.notes]);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 640);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const assignedCandidate = equipment.currentLocation || equipment.deliveryTeam;
    setLocationInput(assignedCandidate || equipment.stagingLocation || '');
  }, [equipment.currentLocation, equipment.stagingLocation, equipment.deliveryTeam]);

  const isOnCall = equipment.status.startsWith('Call ');

  const statusOptions = ['Available', 'In Use', 'In Clinic'];

  const derivedSelectStatus = (() => {
    if (equipment.status === 'In Clinic') return 'In Clinic';
    const locationIsTeam = !!(equipment.currentLocation && event?.staff?.some(s => s.team === equipment.currentLocation));
    if (isOnCall || equipment.deliveryTeam || locationIsTeam || equipment.status === 'In Use') return 'In Use';
    return 'Available';
  })();

  const statusTone = equipmentStatusTone(equipment.status);

  return (
    <Card
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-2xl bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'}`}
      data-testid={`equipment-card-${equipment.name}`}
    >
      <div
        onClick={() => setExpanded(v => !v)}
        className="relative flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none"
      >
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold text-[15px] sm:text-base text-surface-light">
            <EquipmentTypeIcon type={getEquipmentIconType(equipment.name)} className="w-4 h-4 shrink-0" />
            <span className="truncate">{equipment.name}</span>
          </div>
        </div>

        <div className="absolute top-3 right-3 flex items-center gap-2">
          <div className="text-surface-light/70">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>

          {hasVenueMap && (
            <button
              type="button"
              disabled={!canLocateOnMap}
              onClick={(e) => {
                e.stopPropagation();
                if (!canLocateOnMap) return;
                onViewOnMap?.(equipment.name);
              }}
              className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-surface-light"
              aria-label="View on map"
              title={canLocateOnMap ? 'View on map' : "This item's location isn't on the map"}
            >
              <MapIcon className="h-4 w-4" />
            </button>
          )}

          <div
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <Dropdown placement="bottom-end" offset={6}>
              <DropdownTrigger>
                <button
                  className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
                  aria-label="Equipment actions"
                  type="button"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Equipment actions"
                itemClasses={{ base: 'px-3 py-2 text-sm text-surface-light rounded-xl' }}
                onAction={(key) => {
                  if (key === 'ready' && equipment.needsRefresh) onMarkReady?.(equipment.name);
                  if (key === 'delete') onDelete?.(equipment.name);
                }}
              >
                {equipment.needsRefresh ? (
                  <DropdownItem key="ready">{t('Mark Ready')}</DropdownItem>
                ) : null}
                <DropdownItem key="delete" className="text-status-red">{t('Delete')}</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>

      {/* BODY*/}
      <div className="px-4 pb-3 pt-0">
          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Status */}
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-[1]">
              <Select
                aria-label="Status"
                selectedKeys={new Set([(isMobile ? derivedSelectStatus : derivedSelectStatus).trim()])}
                onSelectionChange={(keys) => {
                  const raw = Array.from(keys as Set<string>)[0] || '';
                  const val = (raw || '').trim();
                  if (val) onStatusChange(equipment.name, val);
                }}
                classNames={{
                  base: 'min-w-0',
                  trigger: `${statusTone.fillClass} text-surface-light border ${statusTone.borderClass} rounded-full transition-colors`
                }}
              >
                {statusOptions.map((s) => (
                  <SelectItem key={s}>{t(s)}</SelectItem>
                ))}
              </Select>
            </div>

            {/* Location */}
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-[1.5]">
              <Autocomplete
                aria-label="Location"
                startContent={(
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                    <MapPin className="h-[18px] w-[18px] shrink-0 text-surface-faint" />
                  </span>
                )}
                inputValue={locationInput}
                onInputChange={(val) => {
                  setLocationInput(val);
                }}
                onSelectionChange={(key) => {
                  if (key) {
                    onLocationChange(equipment.name, key as string);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = locationInput.trim();
                    if (value && value !== (equipment.currentLocation || equipment.stagingLocation)) {
                      onLocationChange(equipment.name, value);
                    }
                  }
                }}
                onBlur={() => {
                  const value = locationInput.trim();
                  if (value && value !== (equipment.currentLocation || equipment.stagingLocation)) {
                    onLocationChange(equipment.name, value);
                  } else if (!value) {
                    onLocationChange(equipment.name, equipment.stagingLocation || '');
                  }
                }}
                allowsCustomValue
                className="min-w-0"
                classNames={{
                  base: 'min-w-0 data-[focus-visible=true]:outline-none data-[focus=true]:outline-none',
                  selectorButton: STATIC_SELECTOR_BUTTON_CLASS,
                }}
                selectorButtonProps={staticSelectorButtonProps}
                inputProps={{
                  classNames: {
                    inputWrapper: 'bg-surface-deep text-surface-light border border-surface-liner rounded-full pl-3 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0 data-[focus-visible=true]:ring-0 data-[focus-visible=true]:ring-offset-0 focus-within:ring-0 focus:ring-0',
                    input: 'bg-surface-deep pl-1 data-[focus-visible=true]:ring-0 focus:ring-0 focus-visible:ring-0 outline-none focus:outline-none data-[focus=true]:outline-none'
                  }
                }}
              >
                {(() => {
                  const posts = (event.venue?.posts || []).map(p => (typeof p === 'string' ? p : p.name));
                  const teams = (event.staff || []).map(s => s.team);
                  const opts = Array.from(new Set(['Clinic', ...posts, ...teams, equipment.stagingLocation].filter(Boolean)));
                  return opts.map(p => <AutocompleteItem key={p}>{t(p)}</AutocompleteItem>);
                })()}
              </Autocomplete>
            </div>
          </div>

          {/* Expanded section */}
          <div className={`dispatch-expand-grid ${expanded ? 'dispatch-expand-grid--open' : ''}`}>
            <div className="dispatch-expand-inner">
              <div
                className={`mt-3 dispatch-expand-fade ${expanded ? 'dispatch-expand-fade--open pointer-events-auto' : 'pointer-events-none'}`}
                onClick={e => e.stopPropagation()}
                aria-hidden={!expanded}
              >
              <div className="text-sm font-semibold text-surface-light mb-2">{t('Equipment Details')}</div>
              <div className="text-sm text-surface-light mb-2 space-y-1">
                <div>{t('Staging Location')}: {equipment.stagingLocation ? t(equipment.stagingLocation) : t('Not Set')}</div>
                {equipment.callId && <div>{t('Call ID')}: {equipment.callId}</div>}
                {equipment.deliveryTeam && <div>{t('Delivery Team')}: {t(equipment.deliveryTeam)}</div>}
              </div>
              <div className="text-sm font-semibold text-surface-light mb-1">{t('Notes')}</div>
              <TrackingTextEntry
                mode="note"
                value={notesText}
                onChange={(e) => {
                  setNotesText(e.target.value);
                }}
                onBlur={async () => {
                  notesFocusedRef.current = false;
                  const notes = notesText.trim();
                  
                  const updatedEquipment = event.eventEquipment?.map(eq => 
                    eq.name === equipment.name ? { ...eq, notes } : eq
                  );
                  await updateEvent({ eventEquipment: updatedEquipment });
                }}
                onFocus={() => {
                  notesFocusedRef.current = true;
                }}
                minRows={2}
                maxRows={3}
                variant="flat"
                placeholder={t('Add notes about this equipment')}
                className="min-w-0"
              />
              </div>
            </div>
          </div>
        </div>
    </Card>
  );
}
