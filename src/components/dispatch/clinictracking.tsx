// components/clinictracking.tsx
'use client';

import React from 'react';
import { 
  Button, 
  Dropdown, 
  DropdownTrigger, 
  DropdownMenu, 
  DropdownItem
} from '@heroui/react';
import { MoreVertical, RotateCw } from 'lucide-react';
import type { Event, Call, CallLogEntry, Clinic } from '@/app/types';
import DispatchMotionCell from './motioncell';
import StatusLabel, { getMenuLabel } from './statuslabel';
import TrackingTableBase from './trackingtablebase';
import { TEAM_CARD_ROW_HOVER_CLASS } from '@/lib/statusColors';
import TrackingTextEntry from '@/components/dispatch/trackingtextentry';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { isClinicCallResolved } from '@/lib/clinics';
import { sortActiveCalls } from '@/lib/callSort';
import CallIndicatorIcons from './callindicatoricons';
import { dropdownMotionProps } from './trackingcardparts';
import { textToLog } from '@/lib/logText';

type EditableCallField = keyof Call | 'ageSex';

interface ClinicTrackingTableProps {
  event: Event;
  clinicId?: string;
  clinics?: Clinic[];
  callDisplayNumberMap: Map<string, number>;
  showResolvedClinicCalls: boolean;
  setShowResolvedClinicCalls: (value: boolean | ((prev: boolean) => boolean)) => void;
  openClinicCallId: string | null;
  setOpenClinicCallId: (value: string | null) => void;
  editingCell: { callId: string; field: EditableCallField } | null;
  setEditingCell: React.Dispatch<React.SetStateAction<{ callId: string; field: EditableCallField } | null>>;
  editValue: string;
  setEditValue: (value: string) => void;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  handleCellClick: <K extends keyof Call>(callId: string, field: K, value?: Call[K]) => void;
  handleCellBlur: <K extends keyof Call>(callId: string, field: K) => Promise<void>;
  handleAgeSexBlur: (callId: string) => Promise<void>;
  onOutcomeChange: (callId: string, outcome: string) => void;
  onRevertOutcome: (callId: string) => void;
  handleTogglePin: (callId: string) => void;
  getCallRowClass: (call: Call) => string;
  formatAgeSex: (age?: string | number, gender?: string) => string;
}


const DETAILS_CLOSE_ANIMATION_MS = 320;

const TableColGroup = () => (
  <colgroup>
    <col className="w-16" />
    <col className="w-40" />
    <col className="w-16" />
    <col className="w-48" />
    <col className="w-40" />
    <col />
    <col className="w-20" />
  </colgroup>
);

export default function ClinicTrackingTable({
  event,
  clinicId,
  clinics,
  callDisplayNumberMap,
  showResolvedClinicCalls,
  setShowResolvedClinicCalls,
  openClinicCallId,
  setOpenClinicCallId,
  editingCell,
  setEditingCell,
  editValue,
  setEditValue,
  updateEvent,
  handleCellClick,
  handleCellBlur,
  handleAgeSexBlur,
  onOutcomeChange,
  onRevertOutcome,
  handleTogglePin,
  getCallRowClass,
  formatAgeSex,
}: ClinicTrackingTableProps) {
  const { t } = useDispatchTerms();
  // Persistent local state for notes/log text per call — never goes null to prevent flicker
  const [notesTexts, setNotesTexts] = React.useState<Record<string, string>>({});
  const notesFocusedRef = React.useRef<string | null>(null);
  const [logTexts, setLogTexts] = React.useState<Record<string, string>>({});
  const logFocusedRef = React.useRef<string | null>(null);
  const [closingClinicCallId, setClosingClinicCallId] = React.useState<string | null>(null);
  const [openMenuToken, setOpenMenuToken] = React.useState<string | null>(null);
  const previousOpenClinicCallIdRef = React.useRef<string | null>(null);

  // When there's more than one venue-designated clinic, only show calls tagged for
  // this one; legacy calls with no clinicId fall back to the first clinic so nothing
  // is silently hidden or duplicated across tabs.
  const belongsToThisClinic = React.useCallback(
    (c: Call) => !clinicId || !clinics || clinics.length <= 1 || (c.clinicId ?? clinics[0]?.id) === clinicId,
    [clinicId, clinics]
  );

  const resolvedClinicCalls = (event?.calls || [])
    .filter(c => isClinicCallResolved(c) && belongsToThisClinic(c))
    .sort((a, b) => parseInt(a.id) - parseInt(b.id));
  const unresolvedClinicCalls = sortActiveCalls(
    (event?.calls || [])
      .filter(c => c.status === 'Delivered' && !isClinicCallResolved(c) && belongsToThisClinic(c)),
    'oldest'
  );

  const isClinicCallVisible = React.useCallback(
    (call: Call) => (!isClinicCallResolved(call) || showResolvedClinicCalls) && belongsToThisClinic(call),
    [showResolvedClinicCalls, belongsToThisClinic]
  );

  React.useEffect(() => {
    if (!openMenuToken) return;

    const [, tokenCallId] = openMenuToken.split(':');
    const tokenCall = (event.calls || []).find((call: Call) => call.id === tokenCallId);
    if (!tokenCall) {
      setOpenMenuToken(null);
      return;
    }

    const tokenCallIsResolved = isClinicCallResolved(tokenCall);
    if (tokenCallIsResolved) {
      setOpenMenuToken(null);
    }
  }, [openMenuToken, event.calls, showResolvedClinicCalls]);

  React.useEffect(() => {
    if (!openClinicCallId) return;

    const openCall = (event.calls || []).find((call: Call) => call.id === openClinicCallId);
    if (!openCall) {
      setOpenClinicCallId(null);
      setClosingClinicCallId(null);
      setOpenMenuToken(null);
      return;
    }

    const isOpenCallResolved = isClinicCallResolved(openCall);
    if (isOpenCallResolved && !showResolvedClinicCalls) {
      setOpenClinicCallId(null);
      setClosingClinicCallId(null);
      setOpenMenuToken(null);
    }
  }, [event.calls, openClinicCallId, setOpenClinicCallId, showResolvedClinicCalls]);

  // Sync notes from props when not focused
  React.useEffect(() => {
    if (!event?.calls) return;
    setNotesTexts(prev => {
      const next = { ...prev };
      for (const call of event.calls) {
        if (notesFocusedRef.current !== call.id) {
          next[call.id] = call.notes || '';
        }
      }
      return next;
    });
  }, [event?.calls]);

  React.useLayoutEffect(() => {
    const previousOpenClinicCallId = previousOpenClinicCallIdRef.current;

    if (previousOpenClinicCallId && previousOpenClinicCallId !== openClinicCallId) {
      setClosingClinicCallId(previousOpenClinicCallId);
      const timeout = window.setTimeout(() => {
        setClosingClinicCallId((current) => (current === previousOpenClinicCallId ? null : current));
      }, DETAILS_CLOSE_ANIMATION_MS);

      previousOpenClinicCallIdRef.current = openClinicCallId;
      return () => window.clearTimeout(timeout);
    }

    if (!openClinicCallId && closingClinicCallId) {
      const closingId = closingClinicCallId;
      const timeout = window.setTimeout(() => {
        setClosingClinicCallId((current) => (current === closingId ? null : current));
      }, DETAILS_CLOSE_ANIMATION_MS);

      previousOpenClinicCallIdRef.current = openClinicCallId;
      return () => window.clearTimeout(timeout);
    }

    previousOpenClinicCallIdRef.current = openClinicCallId;
    return undefined;
  }, [closingClinicCallId, openClinicCallId]);

  // Sync log from props when not focused
  React.useEffect(() => {
    if (!event?.calls) return;
    setLogTexts(prev => {
      const next = { ...prev };
      for (const call of event.calls) {
        if (logFocusedRef.current !== call.id) {
          const text = call.log && call.log.length > 0
            ? call.log.map((entry: CallLogEntry) => entry.message).join('\n')
            : '';
          next[call.id] = text;
        }
      }
      return next;
    });
  }, [event?.calls]);

  

  const resolvedToggleFooter = (
    <div className="flex justify-center pt-3">
      <button
        onClick={() => setShowResolvedClinicCalls(prev => !prev)}
        className="text-surface-faint text-base hover:text-surface-light"
        aria-label="Toggle resolved clinic calls"
      >
        {showResolvedClinicCalls ? t('Hide Resolved Clinic Calls') : t('Show Resolved Clinic Calls')}
      </button>
    </div>
  );

  return (
    <div className="col-span-2 text-black w-full h-full min-h-0">
      <TrackingTableBase
        TableColGroup={TableColGroup}
        showStatusColumn={true}
        showTeamAssignmentChips={false}
        footer={resolvedToggleFooter}
      >
            {[
              // Unresolved clinic (Delivered with no outcome)
              ...unresolvedClinicCalls,

              // Resolved clinic (Delivered with an outcome) when toggled on
              ...resolvedClinicCalls,
            ].map(call => (
              <React.Fragment key={call.id}>
                {(() => {
                  const isResolvedClinicCall = isClinicCallResolved(call);
                  const resolvedIndex = isResolvedClinicCall ? resolvedClinicCalls.findIndex((resolvedCall) => resolvedCall.id === call.id) : -1;
                  const motionDelayMs = isResolvedClinicCall && resolvedIndex >= 0 ? resolvedIndex * 30 : 0;
                  const isStatusMenuOpen = openMenuToken === `status:${call.id}` && isClinicCallVisible(call);
                  const isActionMenuOpen = openMenuToken === `action:${call.id}` && isClinicCallVisible(call);
                  const isOpen = openClinicCallId === call.id || closingClinicCallId === call.id;
                  const rowRenderKey = `${call.id}:${isResolvedClinicCall ? 'resolved' : 'active'}:${isClinicCallVisible(call) ? 'visible' : 'hidden'}`;
                  return (
                <tr
                  key={rowRenderKey}
                  className={`cursor-pointer min-h-3.25rem bg-transparent rounded-none ${getCallRowClass(call)} ${isOpen || getCallRowClass(call) ? '' : TEAM_CARD_ROW_HOVER_CLASS} transition-colors ${isResolvedClinicCall && !isClinicCallVisible(call) ? '[&>td]:!border-b-0 pointer-events-none' : ''} ${openClinicCallId === call.id ? '[&>td]:!border-b-0' : ''}`}
                  aria-hidden={isResolvedClinicCall && !isClinicCallVisible(call)}
                  onClick={(e) => {
                    const t = e.target as HTMLElement;
                    if (t.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
                    setOpenClinicCallId(openClinicCallId === call.id ? null : call.id);
                  }}
                >
                  <td className="p-0">
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                      {callDisplayNumberMap.get(call.id)}
                    </DispatchMotionCell>
                  </td>

                  {/* Chief Complaint (inline edit) */}
                  <td
                    className="p-0"
                    onClick={() => handleCellClick(call.id, 'chiefComplaint', call.chiefComplaint)}
                  >
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5 truncate">
                      {editingCell?.callId === call.id && editingCell.field === 'chiefComplaint' ? (
                        <input
                          type="text"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleCellBlur(call.id, 'chiefComplaint')}
                          onKeyDown={e => {
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
                          className="w-full bg-transparent text-surface-light px-0 py-0 border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                        />
                      ) : (
                        call.chiefComplaint || <span className="text-surface-light whitespace-nowrap">[Edit]</span>
                      )}
                    </DispatchMotionCell>
                  </td>

                  {/* A/S (inline edit) */}
                  <td
                    className="p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCell({ callId: call.id, field: 'ageSex' });
                      setEditValue(formatAgeSex(call.age, call.gender));
                    }}
                  >
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                      {editingCell?.callId === call.id && editingCell.field === 'ageSex' ? (
                        <input
                          type="text"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleAgeSexBlur(call.id)}
                          onKeyDown={e => {
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
                          className="w-full bg-transparent text-surface-light px-0 py-0 border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                        />
                      ) : (
                        formatAgeSex(call.age, call.gender) || <span className="text-surface-light whitespace-nowrap">[Edit]</span>
                      )}
                    </DispatchMotionCell>
                  </td>



                  {/* Location (inline edit) */}
                  <td
                    className="p-0"
                    onClick={() => handleCellClick(call.id, 'location', call.location)}
                  >
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5 truncate">
                      {editingCell?.callId === call.id && editingCell.field === 'location' ? (
                        <input
                          type="text"
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
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full bg-transparent text-surface-light px-0 py-0 border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                        />
                      ) : (
                        call.location || <span className="text-surface-light whitespace-nowrap">[Edit]</span>
                      )}
                    </DispatchMotionCell>
                  </td>

                  {/* Status - Using HeroUI Dropdown */}
                  <td className="p-0" onClick={e => e.stopPropagation()}>
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                      <div className={`flex items-center h-8 w-fit max-w-full rounded-full border border-surface-liner bg-surface-liner/30 overflow-hidden ${call.outcome && call.outcome !== 'Pending Transport' ? 'pr-1.5' : ''}`}>
                        <Dropdown
                          motionProps={dropdownMotionProps}
                          isOpen={isStatusMenuOpen}
                          onOpenChange={(isOpen) => {
                            if (isOpen) {
                              if (isResolvedClinicCall) return;
                              setOpenMenuToken(`status:${call.id}`);
                              return;
                            }
                            setOpenMenuToken((current) => (current === `status:${call.id}` ? null : current));
                          }}
                        >
                          <DropdownTrigger>
                            <Button
                              size="sm"
                              radius="full"
                              variant="light"
                              isDisabled={isResolvedClinicCall}
                              className={`min-w-0 h-8 px-2 text-xs justify-start bg-transparent ${isResolvedClinicCall ? 'opacity-100 cursor-default' : 'hover:bg-surface-muted'}`}
                            >
                              <StatusLabel status={call.outcome || 'In Clinic'} text={t(call.outcome || 'In Clinic')} />
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu
                            aria-label="Clinic Status"
                            onAction={(key) => {
                              setOpenMenuToken(null);
                              onOutcomeChange(call.id, key as string);
                            }}
                          >
                            <DropdownItem key="In Clinic">{t('In Clinic')}</DropdownItem>
                            <DropdownItem key="Pending Transport">{getMenuLabel('Pending Transport', t)}</DropdownItem>
                            <DropdownItem key="Transported">{getMenuLabel('Transported', t)}</DropdownItem>
                            <DropdownItem key="AMA">{t('AMA')}</DropdownItem>
                            <DropdownItem key="Discharged">{t('Discharged')}</DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                        {call.outcome && call.outcome !== 'Pending Transport' && (
                          <button
                            type="button"
                            onClick={() => onRevertOutcome(call.id)}
                            className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center shrink-0"
                            aria-label={t('Reopen Call')}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </DispatchMotionCell>
                  </td>

                  {/* Team (inline edit) */}
                  <td className="p-0">
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5">
                      {(call.assignedTeam && call.assignedTeam.length > 0)
                        ? (Array.isArray(call.assignedTeam) ? call.assignedTeam.join(', ') : call.assignedTeam)
                        : (call.detachedTeams?.map(d => d.team).join(', ') || t('Walkup'))}
                    </DispatchMotionCell>
                  </td>
                  {/* Options Ellipsis */}
                  <td className="p-0">
                    <DispatchMotionCell isOpen={isClinicCallVisible(call)} animate={isResolvedClinicCall} delayMs={motionDelayMs} className="px-3 py-2.5 flex items-center justify-end gap-1.5">
                      <CallIndicatorIcons call={call} />
                      <Dropdown
                        motionProps={dropdownMotionProps}
                        placement="bottom-end"
                        offset={6}
                        isOpen={isActionMenuOpen}
                        onOpenChange={(isOpen) => {
                          if (isOpen) {
                            if (isResolvedClinicCall && !showResolvedClinicCalls) return;
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
                              setOpenClinicCallId(openClinicCallId === call.id ? null : call.id);
                            }}
                          >
                            {openClinicCallId === call.id ? t('Hide Log') : t('Show Log')}
                          </DropdownItem>
                          <DropdownItem
                            key="pin"
                            isDisabled={isResolvedClinicCall}
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
                            onPress={async () => {
                              setOpenMenuToken(null);
                              if (confirm('Are you sure you want to delete this call? This action cannot be undone.')) {
                                const updatedCalls = event.calls.filter((c: Call) => c.id !== call.id);
                                await updateEvent({ calls: updatedCalls });
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

                {/* Expanded row for notes and log - NO ANIMATION */}
                {(isClinicCallVisible(call) && (openClinicCallId === call.id || closingClinicCallId === call.id)) && (
                  <tr>
                    <td
                      colSpan={7}
                      className={`p-0 align-top !border-b-0 ${getCallRowClass(call)}`}
                      onClick={() => setOpenClinicCallId(null)}
                    >
                      <div
                        className={`px-2 overflow-hidden transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          openClinicCallId === call.id
                            ? 'pt-1.5 pb-3'
                            : 'pt-0 pb-0'
                        }`}
                      >
                        <DispatchMotionCell isOpen={openClinicCallId === call.id} animate={true} className="cursor-pointer" overflowVisibleWhenOpen>
                          {/* Notes - Using HeroUI Textarea - NO LOG ENTRY */}
                          <div
                            className="mt-0 mb-1.5 text-sm text-surface-light"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="font-semibold mb-1">{t('Notes')}</div>
                            <TrackingTextEntry
                              mode="note"
                              value={notesTexts[call.id] ?? (call.notes || '')}
                              onChange={(e) => {
                                setNotesTexts(prev => ({ ...prev, [call.id]: e.target.value }));
                              }}
                              onBlur={async () => {
                                notesFocusedRef.current = null;
                                const text = notesTexts[call.id] ?? '';
                                const callNow = event?.calls.find((c: Call) => c.id === call.id);
                                if (!callNow) return;
                                
                                if ((callNow.notes || '') !== text) {
                                  const updatedCall = { ...callNow, notes: text };
                                  const updated = event!.calls.map((c: Call) => 
                                    c.id === call.id ? updatedCall : c
                                  );
                                  await updateEvent({ calls: updated });
                                }
                              }}
                              onFocus={() => {
                                notesFocusedRef.current = call.id;
                              }}
                              minRows={2}
                              maxRows={3}
                              variant="flat"
                              placeholder={t('Add notes')}
                              className="min-w-0"
                            />
                          </div>


                          {/* Log - Using HeroUI ScrollShadow */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <strong>{t('Log for Call')} #{callDisplayNumberMap.get(call.id)}:</strong>
                              <TrackingTextEntry
                                mode="log"
                                value={logTexts[call.id] ?? (() => {
                                  if (call.log && call.log.length > 0) {
                                    return call.log.map((entry: CallLogEntry) => entry.message).join('\n');
                                  }
                                  return '';
                                })()}
                                onChange={(e) => {
                                  setLogTexts(prev => ({ ...prev, [call.id]: e.target.value }));
                                }}
                                onBlur={async () => {
                                  logFocusedRef.current = null;
                                  const text = logTexts[call.id] ?? '';
                                  const callNow = event?.calls.find((c: Call) => c.id === call.id);
                                  if (!callNow) return;
                                  
                                  // Keep unchanged lines' timestamps — the call timer counts from the first entry.
                                  const newLog = textToLog(text, callNow.log);
                                  if (!newLog) return;
                                  
                                  const updatedCall = { ...callNow, log: newLog };
                                  const updated = event!.calls.map((c: Call) => 
                                    c.id === call.id ? updatedCall : c
                                  );
                                  await updateEvent({ calls: updated });
                                }}
                                onFocus={() => {
                                  logFocusedRef.current = call.id;
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    const now = new Date();
                                    const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
                                    setLogTexts(prev => ({ ...prev, [call.id]: (prev[call.id] || '') + `\n${hhmm} - ` }));
                                  }
                                }}
                                minRows={4}
                                maxRows={5}
                                variant="flat"
                                placeholder={t('No log entries')}
                                className="min-w-0"
                              />
                          </div>
                        </DispatchMotionCell>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
      </TrackingTableBase>
    </div>
  );
}
