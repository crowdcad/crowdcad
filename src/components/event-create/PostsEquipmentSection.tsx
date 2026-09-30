import React from 'react';
import { Button, Checkbox, Chip, Input, ScrollShadow, Select, SelectItem, Tooltip } from '@heroui/react';
import { CircleHelp, Plus, Trash2 } from 'lucide-react';
import type { Event, Post, Venue, EventEquipment } from '@/app/types';
import { randomId } from '@/lib/utils';

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
          <div className="flex items-end gap-2">
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
}: Pick<Props, 'hasVenue' | 'eventData' | 'setEventData' | 'selectClassNames' | 'allPosts' | 'getPostName'>) {
  const [newEquipName, setNewEquipName] = React.useState('');

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

  const setCustomEquipmentLocation = (id: string, locName: string) => {
    setEventData((prev) => ({
      ...prev,
      eventEquipment: prev.eventEquipment.map((e) => (e.id === id ? { ...e, defaultLocation: locName } : e)),
    }));
  };

  return (
    <div className="flex-1 min-h-0 py-3 flex flex-col">
      {hasVenue && (
        <>
          <div className="flex-shrink-0 pb-3 flex gap-2">
            <Input
              placeholder="Add equipment for this event only"
              value={newEquipName}
              onValueChange={setNewEquipName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomEquipment();
                }
              }}
              variant="flat"
              size="lg"
              classNames={{
                input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
                inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
              }}
            />
            <Button
              isIconOnly
              size="lg"
              onPress={addCustomEquipment}
              className="flex-shrink-0 bg-accent hover:bg-accent/90 text-surface-light"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <ScrollShadow className="space-y-1.5 pr-2 scrollbar-hide flex-1 min-h-0" hideScrollBar style={{ overflow: 'auto' }}>
            {customEquipment.map((equip) => (
              <div key={equip.id} className="rounded-sm p-3 bg-default/40">
                <div className="flex items-center gap-3">
                  <span className="text-surface-light font-medium flex-shrink-0">{equip.name}</span>
                  <Chip size="sm" variant="flat" className="bg-accent/20 text-accent">
                    Event only
                  </Chip>
                  <Select
                    variant="flat"
                    color="default"
                    placeholder="Select Default Location"
                    selectedKeys={equip.defaultLocation ? [equip.defaultLocation] : []}
                    onSelectionChange={(keys) => {
                      const locName = Array.from(keys)[0] as string;
                      setCustomEquipmentLocation(equip.id, locName);
                    }}
                    classNames={{
                      ...selectClassNames,
                      base: 'max-w-[200px]',
                    }}
                    size="sm"
                    className="ml-auto"
                  >
                    {allPosts.map((post) => {
                      const postName = getPostName(post);
                      return <SelectItem key={postName}>{postName}</SelectItem>;
                    })}
                  </Select>
                  <button
                    type="button"
                    onClick={() => removeCustomEquipment(equip.id)}
                    className="p-1 rounded bg-transparent flex-shrink-0"
                    aria-label="Remove equipment"
                  >
                    <Trash2 className="h-4 w-4 text-status-red" />
                  </button>
                </div>
              </div>
            ))}

            {eventData.venue?.equipment?.map((equip) => {
              const selectedEquip = eventData.eventEquipment.find((e) => e.id === equip.id);
              const isSelected = !!selectedEquip;
              return (
                <div key={equip.id} className="rounded-sm p-3 bg-default/40">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      isSelected={isSelected}
                      classNames={{ wrapper: 'after:bg-accent' }}
                      onValueChange={(checked) => {
                        if (checked) {
                          setEventData((prev) => ({
                            ...prev,
                            // Inherits the venue's own configured default location (if any) —
                            // still just a starting point, adjustable per event via the Select below.
                            eventEquipment: [...prev.eventEquipment, { ...equip, defaultLocation: equip.location }],
                          }));
                        } else {
                          setEventData((prev) => ({
                            ...prev,
                            eventEquipment: prev.eventEquipment.filter((e) => e.id !== equip.id),
                          }));
                        }
                      }}
                    />
                    <span className="text-surface-light font-medium flex-shrink-0">{equip.name}</span>
                    {isSelected && (
                      <Select
                        variant="flat"
                        color="default"
                        placeholder="Select Default Location"
                        selectedKeys={selectedEquip?.defaultLocation ? [selectedEquip.defaultLocation] : []}
                        onSelectionChange={(keys) => {
                          const locName = Array.from(keys)[0] as string;
                          setEventData((prev) => ({
                            ...prev,
                            eventEquipment: prev.eventEquipment.map((e) =>
                              e.id === equip.id ? { ...e, defaultLocation: locName } : e
                            ),
                          }));
                        }}
                        classNames={{
                          ...selectClassNames,
                          base: 'max-w-[200px]',
                        }}
                        size="sm"
                        className="ml-auto"
                      >
                        {allPosts.map((post) => {
                          const postName = getPostName(post);
                          return <SelectItem key={postName}>{postName}</SelectItem>;
                        })}
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
          </ScrollShadow>
        </>
      )}
    </div>
  );
}
