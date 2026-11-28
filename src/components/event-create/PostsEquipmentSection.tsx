import React from 'react';
import { Button, Checkbox, Chip, Input, ScrollShadow, Select, SelectItem, Tooltip } from '@heroui/react';
import { CircleHelp, Plus, Trash2 } from '@/components/ui/icons';
import type { Event, Post, Venue, EventEquipment } from '@/app/types';
import { randomId } from '@/lib/utils';
import { equipmentHolderUnit, setupEquipmentHolder } from '@/lib/equipmentCustody';
import EquipmentTeamSelect from './EquipmentTeamSelect';
import TutorialTip from '@/components/ui/TutorialTip';
import { SMALL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

type FlattenedPost = {
  post: Post;
  layerName: string;
};

type Props = {
  hasVenue: boolean;
  postsEnabled: boolean;
  setPostsEnabled: (value: boolean) => void;
  flattenedPosts: FlattenedPost[];
  allPosts: Post[];
  getPostName: (post: Post) => string;
  eventData: Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] };
  setEventData: React.Dispatch<React.SetStateAction<Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] }>>;
  lastSelectedPostIndex: number | null;
  setLastSelectedPostIndex: React.Dispatch<React.SetStateAction<number | null>>;
  selectClassNames: {
    label: string;
    input: string;
    inputWrapper: string;
  };
  /** A tutorial callout under the post picker (Lite mode). */
  postsHint?: string;
};

export function PostsSelectionSection({
  hasVenue,
  postsEnabled,
  setPostsEnabled,
  flattenedPosts,
  allPosts,
  getPostName,
  eventData,
  setEventData,
  lastSelectedPostIndex,
  setLastSelectedPostIndex,
  selectClassNames,
  postsHint,
}: Props) {
  if (!hasVenue) return null;

  return (
    <>
      <div className="flex-shrink-0 pb-3 pt-0.5 flex items-center justify-between">
        <h3 className="text-surface-light font-semibold text-xl inline-flex items-center gap-1.5">
          Posts
          <Tooltip content="Which locations get auto-generated posting assignments on the repost schedule below. Teams can still be manually assigned to any location regardless of this selection." placement="top">
            <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
          </Tooltip>
        </h3>
        <Checkbox
          isSelected={postsEnabled}
          onValueChange={setPostsEnabled}
          size="sm"
          classNames={{ wrapper: 'after:bg-accent' }}
        >
          <span className="text-sm text-surface-light">Enable Posts</span>
        </Checkbox>
      </div>

      <div className="space-y-3">
        <div className={`space-y-3 ${!postsEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="relative flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Select
                label="Select Posts"
                labelPlacement="outside"
                variant="flat"
                color="default"
                placeholder="Choose posts for this event"
                selectionMode="multiple"
                selectedKeys={new Set((eventData.eventPosts || []).map((post) => getPostName(post)))}
                isDisabled={!postsEnabled}
                classNames={selectClassNames}
                size="lg"
                disabledKeys={[]}
              >
                {flattenedPosts.map(({ post, layerName }, idx) => {
              const postName = getPostName(post);
              return (
                <SelectItem
                  key={postName}
                  textValue={postName}
                  onClick={(e: React.MouseEvent) => {
                    const me = e as React.MouseEvent;
                    me.preventDefault();
                    me.stopPropagation();

                    if (me.shiftKey && lastSelectedPostIndex !== null) {
                      const start = Math.min(lastSelectedPostIndex, idx);
                      const end = Math.max(lastSelectedPostIndex, idx);
                      const namesInRange = flattenedPosts.slice(start, end + 1).map((fp) => getPostName(fp.post));
                      const uniqueNames = Array.from(new Set([...(eventData.eventPosts || []).map((p) => getPostName(p)), ...namesInRange]));
                      const newPosts = uniqueNames
                        .map((name) => allPosts.find((p) => getPostName(p) === name))
                        .filter((postValue): postValue is Post => Boolean(postValue));
                      setEventData((prev) => ({ ...prev, eventPosts: newPosts }));
                      setLastSelectedPostIndex(idx);
                      return;
                    }

                    const selectedSet = new Set((eventData.eventPosts || []).map((p) => getPostName(p)));

                    if (me.ctrlKey || me.metaKey) {
                      if (selectedSet.has(postName)) selectedSet.delete(postName);
                      else selectedSet.add(postName);
                      const newPosts = Array.from(selectedSet)
                        .map((name) => allPosts.find((p) => getPostName(p) === name))
                        .filter((postValue): postValue is Post => Boolean(postValue));
                      setEventData((prev) => ({ ...prev, eventPosts: newPosts }));
                      setLastSelectedPostIndex(idx);
                      return;
                    }

                    if (selectedSet.has(postName)) selectedSet.delete(postName);
                    else selectedSet.add(postName);
                    const newPosts = Array.from(selectedSet)
                      .map((name) => allPosts.find((p) => getPostName(p) === name))
                      .filter((postValue): postValue is Post => Boolean(postValue));
                    setEventData((prev) => ({ ...prev, eventPosts: newPosts }));
                    setLastSelectedPostIndex(idx);
                  }}
                >
                  {layerName ? `${postName} (${layerName})` : postName}
                </SelectItem>
              );
            })}
              </Select>
            </div>
            <Button
              size="lg"
              variant="flat"
              isDisabled={!postsEnabled || allPosts.length === 0}
              onPress={() => setEventData((prev) => ({ ...prev, eventPosts: allPosts }))}
              className="flex-shrink-0"
            >
              Enable All
            </Button>
            {postsHint && postsEnabled && allPosts.length > 0 && <TutorialTip className="top-full mt-2 left-0">{postsHint}</TutorialTip>}
          </div>

          {(eventData.eventPosts || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(eventData.eventPosts || []).map((post, idx) => {
                const postName = getPostName(post);
                return (
                  <Chip
                    key={idx}
                    onClose={() => {
                      setEventData((prev) => ({
                        ...prev,
                        eventPosts: (prev.eventPosts || []).filter((_, i) => i !== idx),
                      }));
                    }}
                    variant="flat"
                    className="bg-accent/20 text-accent"
                  >
                    {postName}
                  </Chip>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function EquipmentSelectionSection({
  hasVenue,
  eventData,
  setEventData,
  selectClassNames,
  allPosts,
  getPostName,
  vehicleNames = [],
}: Pick<Props, 'hasVenue' | 'eventData' | 'setEventData' | 'selectClassNames' | 'allPosts' | 'getPostName'> & {
  /** The event's vehicles, while vehicles are on: equipment can live on one. */
  vehicleNames?: string[];
}) {
  const [newEquipName, setNewEquipName] = React.useState('');
  const locationNames = Array.from(new Set([...allPosts.map(getPostName), ...vehicleNames]));

  const venueEquipmentIds = new Set((eventData.venue?.equipment || []).map((e) => e.id));
  const customEquipment = eventData.eventEquipment.filter((e) => !venueEquipmentIds.has(e.id));

  const addCustomEquipment = () => {
    const name = newEquipName.trim();
    if (!name) return;
    setEventData((prev) => ({
      ...prev,
      eventEquipment: [
        ...prev.eventEquipment,
        { id: randomId(), name, status: 'Available', defaultLocation: undefined },
      ],
    }));
    setNewEquipName('');
  };

  const removeCustomEquipment = (id: string) => {
    setEventData((prev) => ({
      ...prev,
      eventEquipment: prev.eventEquipment.filter((e) => e.id !== id),
    }));
  };

  const units = [...(eventData.staff || []).map((s) => s.team), ...(eventData.supervisor || []).map((s) => s.team)];
  // Starts the event with a team holding it (or back at its default location), as on the board.
  const setHolder = (name: string, unit: string) =>
    setEventData((prev) => {
      const next = setupEquipmentHolder({ ...prev, staff: prev.staff || [], supervisor: prev.supervisor || [] }, name, unit, Date.now());
      return { ...prev, ...next };
    });
  const teamSelect = (equip: EventEquipment) => (
    <EquipmentTeamSelect itemName={equip.name} units={units} value={equipmentHolderUnit(equip)} onChange={(unit) => setHolder(equip.name, unit)} classNames={selectClassNames} />
  );

  const setCustomEquipmentLocation = (id: string, locName: string) => {
    setEventData((prev) => ({
      ...prev,
      eventEquipment: prev.eventEquipment.map((e) => (e.id === id ? { ...e, defaultLocation: locName } : e)),
    }));
  };

  const venueEquipment = eventData.venue?.equipment || [];
  const selectedIds = new Set(eventData.eventEquipment.map((e) => e.id));
  const allSelected = venueEquipment.length > 0 && venueEquipment.every((e) => selectedIds.has(e.id));
  // Picking venue equipment inherits the venue's own default location, adjustable per event.
  const setVenueSelected = (items: typeof venueEquipment, checked: boolean) =>
    setEventData((prev) => {
      const ids = new Set(items.map((e) => e.id));
      const kept = prev.eventEquipment.filter((e) => !ids.has(e.id));
      const had = new Set(prev.eventEquipment.map((e) => e.id));
      return { ...prev, eventEquipment: checked ? [...prev.eventEquipment, ...items.filter((e) => !had.has(e.id)).map((e) => ({ ...e, defaultLocation: e.location }))] : kept };
    });

  const locationSelect = (equip: EventEquipment) => (
    <Select
      aria-label={`Default location for ${equip.name}`}
      variant="flat"
      color="default"
      placeholder="Default Location"
      selectedKeys={equip.defaultLocation ? [equip.defaultLocation] : []}
      onSelectionChange={(keys) => setCustomEquipmentLocation(equip.id, Array.from(keys)[0] as string)}
      classNames={{ ...selectClassNames, base: 'w-48' }}
      size="sm"
    >
      {locationNames.map((name) => (
        <SelectItem key={name}>{name}</SelectItem>
      ))}
    </Select>
  );

  const cell = 'px-3 py-1.5';
  return (
    <div className="flex-1 min-h-0 py-3 flex flex-col">
      {hasVenue && (
        <ScrollShadow className="flex-1 min-h-0 border border-surface-liner" hideScrollBar style={{ overflow: 'auto' }}>
          <table className="w-full border-collapse text-left text-sm" data-testid="event-equipment-table">
            <thead className="sticky top-0 z-10 bg-surface-deep text-xs uppercase tracking-wider text-surface-faint">
              <tr>
                <th className="w-10 px-3 py-2">
                  {venueEquipment.length > 0 && (
                    <Checkbox
                      aria-label="Select all equipment"
                      size="sm"
                      isSelected={allSelected}
                      isIndeterminate={!allSelected && venueEquipment.some((e) => selectedIds.has(e.id))}
                      classNames={{ wrapper: 'after:bg-accent' }}
                      onValueChange={(checked) => setVenueSelected(venueEquipment, checked)}
                    />
                  )}
                </th>
                <th className="px-3 py-2 font-semibold">Equipment</th>
                <th className="px-3 py-2 font-semibold">Default Location</th>
                {units.length > 0 && <th className="px-3 py-2 font-semibold">Team</th>}
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {venueEquipment.map((equip) => {
                const selected = eventData.eventEquipment.find((e) => e.id === equip.id);
                return (
                  <tr key={equip.id} className={`border-t border-surface-liner ${selected ? '' : 'text-surface-faint'}`} data-testid={`event-equipment-row-${equip.name}`}>
                    <td className={cell}>
                      <Checkbox aria-label={`Use ${equip.name}`} size="sm" isSelected={!!selected} classNames={{ wrapper: 'after:bg-accent' }} onValueChange={(checked) => setVenueSelected([equip], checked)} />
                    </td>
                    <td className={`${cell} font-medium`}>{equip.name}</td>
                    <td className={cell}>{selected && locationSelect(selected)}</td>
                    {units.length > 0 && <td className={cell}>{selected && teamSelect(selected)}</td>}
                    <td className={cell} />
                  </tr>
                );
              })}
              {customEquipment.map((equip) => (
                <tr key={equip.id} className="border-t border-surface-liner" data-testid={`event-equipment-row-${equip.name}`}>
                  <td className={cell} />
                  <td className={`${cell} font-medium`}>
                    {equip.name}
                    <Tooltip content="Event only. Add this equipment in the venue builder to make it permanent." placement="top">
                      <span className="ml-0.5 cursor-help text-accent" aria-label="Event only">
                        *
                      </span>
                    </Tooltip>
                  </td>
                  <td className={cell}>{locationSelect(equip)}</td>
                  {units.length > 0 && <td className={cell}>{teamSelect(equip)}</td>}
                  <td className={cell}>
                    <button type="button" onClick={() => removeCustomEquipment(equip.id)} className="p-1 bg-transparent" aria-label={`Remove ${equip.name}`}>
                      <Trash2 className="h-4 w-4 text-status-red" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-surface-liner">
                <td className={cell} />
                <td className={cell} colSpan={units.length > 0 ? 3 : 2}>
                  <Input
                    placeholder="Add equipment for this event"
                    aria-label="Add equipment for this event"
                    value={newEquipName}
                    onValueChange={setNewEquipName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomEquipment();
                      }
                    }}
                    variant="flat"
                    size="sm"
                    classNames={SMALL_FIELD_CLASSNAMES}
                  />
                </td>
                <td className={cell}>
                  <Button isIconOnly size="sm" onPress={addCustomEquipment} aria-label="Add equipment" className="bg-accent text-surface-light hover:bg-accent/90" isDisabled={!newEquipName.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </ScrollShadow>
      )}
    </div>
  );
}
