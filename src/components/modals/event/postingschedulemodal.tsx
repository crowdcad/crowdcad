'use client';

import React, { useState, useMemo } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody,
  Button, Select, SelectItem, ButtonGroup,
} from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Event, PostAssignment } from '@/app/types';
import { computeAutofillAssignments } from '@/lib/postingAutofill';

interface PostingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  postAssignments: PostAssignment;
  onPostAssignment: (time: string, postKey: string, team: string) => Promise<void>;
  onBulkPostAssignment: (assignments: PostAssignment) => Promise<void>;
  onClearAllPostAssignments: () => Promise<void>;
  onUpdatePostingTime: (originalTime: string, newTime: string) => Promise<void>;
  getCurrentActiveTime: () => string | null;
  updateEvent: (updateInput: Partial<Event> | ((current: Event) => Partial<Event>)) => Promise<void>;
  notifyPostAssignmentChange: (reason: string, details: Record<string, unknown>) => void;
}

interface AssignmentDropdownProps {
  value: string;
  onChange: (newValue: string) => void;
  options: string[];
  postKey: string;
  time: string;
}

const AssignmentDropdown = React.memo(function AssignmentDropdown({ 
  value, 
  onChange, 
  options,
  postKey,
  time,
}: AssignmentDropdownProps) {
  const selectClassNames = {
    label: 'text-surface-light mb-1',
    trigger: 'rounded-large px-3 py-1 min-h-unit-8 w-auto border border-surface-liner bg-transparent hover:bg-surface-deep data-[focus=true]:outline-none',
    innerWrapper: 'gap-0 pr-0',
    value: 'text-surface-light text-xs',
    popover: 'bg-surface-deepest border border-surface-liner rounded-large',
    listbox: 'p-2',
    selectorIcon: 'text-surface-light',
  } as const;


  return (
    <Select
      aria-label={`Assignment for ${postKey} at ${time}`}
      variant="flat"
      color="default"
      size="sm"
      radius="lg"
      classNames={selectClassNames}
      selectedKeys={value ? new Set([value]) : new Set()}
      onSelectionChange={(keys) => {
        const val = Array.from(keys)[0] as string | undefined;
        onChange(val ?? '');
      }}
      scrollShadowProps={{
        isEnabled: false,
      }}
      popoverProps={{
        placement: 'bottom',
        shouldFlip: true,
        shouldBlockScroll: false,
        offset: 1,
        classNames: {
          content: 'w-fit max-w-[min(100px,calc(50vw-0.5rem))] p-0',
        },
      }}
      listboxProps={{
        itemClasses: {
          base: 'whitespace-normal break-words py-1 px-1',
        },
      }}
    >
      {[
        ...options.map((team) => (
          <SelectItem key={team} aria-label={team} textValue={team}>
            {team}
          </SelectItem>
        ))
      ]}
    </Select>
  );
});




function getPostKey(post: string | { name: string; }): string {
  if (typeof post === 'string') {
    return post;
  }
  return post.name;
}

export default function PostingScheduleModal({
  isOpen,
  onClose,
  event,
  postAssignments,
  onPostAssignment,
  onBulkPostAssignment,
  onClearAllPostAssignments,
  onUpdatePostingTime,
  getCurrentActiveTime,
}: PostingScheduleModalProps) {
  const [editingTime, setEditingTime] = useState<{ originalTime: string; newTime: string } | null>(null);
  const [mobileColumnOffset, setMobileColumnOffset] = useState(0);

  // Find the index of the current active time
  const activeTime = getCurrentActiveTime();
  
  // Memoize times to prevent creating a new array reference on every render.
  // If `event.postingTimes` is empty, fall back to keys from `postAssignments` so
  // the table still renders columns when times were saved in assignments but
  // the explicit postingTimes array is missing.
  const times = useMemo(() => {
    const rawExplicit = event.postingTimes || [];
    // Normalize to strings and filter out empty values
    const explicit = rawExplicit.map(t => (t === null || t === undefined) ? '' : String(t)).filter(t => t !== '');
    if (explicit.length > 0) return explicit;
    // Fallback: gather keys from postAssignments in insertion order and normalize
    const keys = Object.keys(postAssignments || {}).map(k => String(k)).filter(k => k !== '');
    return keys;
  }, [event.postingTimes, postAssignments]);

  const activeTimeIndex = useMemo(() => {
    if (!activeTime) return 0;
    const index = times.indexOf(activeTime);
    return index !== -1 ? index : 0;
  }, [activeTime, times]);

  // Set initial mobile column offset to show active time
  React.useEffect(() => {
    if (isOpen) {
      setMobileColumnOffset(activeTimeIndex);
    }
  }, [isOpen, activeTimeIndex]);

  const handleUpdatePostingTime = async (originalTime: string, newTime: string) => {
    await onUpdatePostingTime(originalTime, newTime);
    setEditingTime(null);
  };

  function formatTimeLabel(time: string) {
    if (!time && time !== '0') return '';
    const t = String(time);
    // Already HH:MM
    if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0');
    // Epoch milliseconds or seconds
    const n = Number(t);
    if (!Number.isNaN(n)) {
      const asMs = (t.length <= 10) ? n * 1000 : n;
      const d = new Date(asMs);
      if (!Number.isNaN(d.getTime())) {
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      }
    }
    // ISO string
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }
    return t;
  }

  const handleAutofill = async () => {
    if (!event) return;
    
    const times = event.postingTimes || [];
    const posts = event.eventPosts || [];
    const staffTeams = event.staff?.map(team => team.team) || [];
    
    if (!times.length || !posts.length || !staffTeams.length) return;

    onBulkPostAssignment(
      computeAutofillAssignments(times, posts.map(getPostKey), staffTeams, postAssignments || {})
    );
  };

  const posts = event.eventPosts || [];
  const staffOptions = event.staff?.map(team => team.team) || [];

  // Mobile: show 2 columns at a time
  const visibleMobileColumns = useMemo(() => {
    if (times.length === 0) return [];
    const startIdx = mobileColumnOffset;
    const endIdx = Math.min(startIdx + 2, times.length);
    return times.slice(startIdx, endIdx);
  }, [times, mobileColumnOffset]);

  const canGoPrev = mobileColumnOffset > 0;
  const canGoNext = mobileColumnOffset + 2 < times.length;

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      size="5xl"
      scrollBehavior="inside"
      placement="center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: 'rounded-lg bg-surface-deepest text-surface-light max-h-[90vh] max-w-[95vw] sm:max-w-[90vw] lg:max-w-5xl overflow-hidden',
        wrapper: 'overflow-hidden',
        header: 'pb-3',
        body: 'pt-2 pb-4 overflow-y-auto overflow-x-hidden',
      }}
    >
      <ModalContent>
        { (
          <>
            <ModalHeader className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Schedule</h2>
              <div className="flex items-center gap-2">
                <Button
                  onPress={onClearAllPostAssignments}
                  size="sm"
                  className="px-2 py-1 hover:bg-status-red/10 border border-status-red text-status-red"
                  variant="bordered"
                  radius="full"
                >
                  Clear
                </Button>
                <Button
                  onPress={handleAutofill}
                  size="sm"
                  radius="full"
                  variant="flat"
                  className="px-2 py-1 hover:bg-surface-liner text-surface-light"
                >
                  Autofill
                </Button>
              </div>
            </ModalHeader>


            <ModalBody>
              {/* Desktop View - Full Table */}
              <div className="hidden lg:block w-full overflow-x-auto scrollbar-hide">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-surface-liner">
                      <th className="p-3 text-left font-semibold sticky left-0 bg-surface-deepest z-10 w-1 whitespace-nowrap border-r border-surface-liner">
                        Post
                      </th>
                      {times.map(time => {
                        const isCurrentPeriod = time === activeTime;

                        return (
                          <th
                            key={time}
                            className={`p-2 text-left whitespace-nowrap ${
                              isCurrentPeriod ? 'bg-surface-deep' : 'bg-transparent'
                            }`}
                            style={{ maxWidth: '180px', minWidth: '120px' }}
                          >
                            {editingTime?.originalTime === time ? (
                              <input
                                value={editingTime.newTime}
                                onChange={e =>
                                  setEditingTime({ originalTime: time, newTime: e.target.value })
                                }
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => handleUpdatePostingTime(time, editingTime.newTime)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    handleUpdatePostingTime(time, editingTime.newTime);
                                  }
                                }}
                                autoFocus
                                className="w-full p-1 rounded bg-surface-deep text-surface-light border border-surface-liner outline-none"
                              />
                              ) : (
                              <span
                                onClick={() =>
                                  setEditingTime({ originalTime: time, newTime: time })
                                }
                                className="cursor-pointer hover:text-status-blue"
                              >
                                {formatTimeLabel(time)}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr key={getPostKey(post)} className="border-b border-surface-liner">
                        <td className="p-3 font-medium sticky left-0 bg-surface-deepest z-10 w-1 whitespace-nowrap border-r border-surface-liner">
                          {getPostKey(post)}
                        </td>
                        {times.map((time) => {
                          const isCurrentPeriod = time === activeTime;
                          const currentAssignment = postAssignments?.[time]?.[getPostKey(post)] || '';

                          return (
                            <td
                              key={time}
                              className={`p-2 ${
                                isCurrentPeriod ? 'bg-surface-deep' : ''
                              }`}
                            >
                              <AssignmentDropdown
                                value={currentAssignment}
                                onChange={(newTeam) => onPostAssignment(time, getPostKey(post), newTeam)}
                                options={staffOptions}
                                postKey={getPostKey(post)}
                                time={time}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile View - 2 Columns with Navigation */}
              <div className="lg:hidden">
                {/* Mobile Table */}
                <div className="w-full mb-4">
                  <table className="w-full border-collapse text-sm table-fixed">
                    <thead>
                      <tr className="border-b border-surface-liner">
                        <th className="p-2 text-left font-semibold bg-transparent w-1/3">
                          Post
                        </th>
                          {visibleMobileColumns.map(time => {
                          const isCurrentPeriod = time === activeTime;

                          return (
                            <th
                              key={time}
                              className={`p-2 text-left w-1/3 ${
                                isCurrentPeriod ? 'bg-surface-deep' : 'bg-transparent'
                              }`}
                            >
                              {editingTime?.originalTime === time ? (
                                <input
                                  value={editingTime.newTime}
                                  onChange={e =>
                                    setEditingTime({ originalTime: time, newTime: e.target.value })
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={() => handleUpdatePostingTime(time, editingTime.newTime)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      handleUpdatePostingTime(time, editingTime.newTime);
                                    }
                                  }}
                                  autoFocus
                                  className="w-full p-1 rounded bg-surface-deep text-surface-light border border-surface-liner outline-none text-xs"
                                />
                              ) : (
                                <span
                                  onClick={() =>
                                    setEditingTime({ originalTime: time, newTime: time })
                                  }
                                  className="cursor-pointer hover:text-status-blue text-xs"
                                >
                                  {formatTimeLabel(time)}
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((post) => (
                        <tr key={getPostKey(post)} className="border-b border-surface-liner">
                          <td className="p-2 font-medium bg-transparent text-xs w-1/3 align-top">
                            {getPostKey(post)}
                          </td>
                          {visibleMobileColumns.map((time) => {
                            const isCurrentPeriod = time === activeTime;
                            const currentAssignment = postAssignments?.[time]?.[getPostKey(post)] || '';

                            return (
                              <td
                                key={time}
                                className={`p-2 w-1/3 align-top relative ${
                                  isCurrentPeriod ? 'bg-surface-deep' : ''
                                }`}
                              >
                                <AssignmentDropdown
                                  value={currentAssignment}
                                  onChange={(newTeam) => onPostAssignment(time, getPostKey(post), newTeam)}
                                  options={staffOptions}
                                  postKey={getPostKey(post)}
                                  time={time}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Column Navigation - Moved to Bottom */}
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-semibold">
                    {visibleMobileColumns.map(formatTimeLabel).join(' - ')}
                  </h3>
                  <ButtonGroup size="sm" radius="full" variant="flat">
                    <Button
                      isIconOnly
                      className="text-surface-light hover:bg-surface-deep"
                      onPress={() => setMobileColumnOffset(prev => Math.max(0, prev - 1))}
                      isDisabled={!canGoPrev}
                      aria-label="Previous columns"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      isIconOnly
                      className="text-surface-light hover:bg-surface-deep"
                      onPress={() => setMobileColumnOffset(prev => Math.min(times.length - 2, prev + 1))}
                      isDisabled={!canGoNext}
                      aria-label="Next columns"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </ButtonGroup>
                </div>
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
