'use client';
/**
 * The phone's call and clinic-patient card around its body: it expands on tap, and its header carries the
 * title, the timer, the indicator icons and a ⋮ menu (Show/Hide Log first, then the card's own actions).
 * Shared by CallTrackingCard and ClinicTrackingCard.
 */
import React from 'react';
import { Card, CardHeader, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { MoreVertical } from 'lucide-react';
import { dropdownMotionProps } from './trackingcardparts';
import { TRACKING_RESOLVED_CARD_CLASS } from '@/lib/statusColors';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

export interface TrackingCardAction {
  key: string;
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  danger?: boolean;
}

export default function TrackingCardShell({
  testId,
  title,
  timer,
  indicators,
  actions,
  expanded,
  onToggle,
  resolved,
  children,
}: {
  testId?: string;
  title: React.ReactNode;
  timer: React.ReactNode;
  indicators?: React.ReactNode;
  actions: TrackingCardAction[];
  expanded: boolean;
  onToggle: () => void;
  resolved: boolean;
  children: React.ReactNode;
}) {
  const { t } = useDispatchTerms();
  return (
    <Card
      data-testid={testId}
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-lg bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'} ${resolved && !expanded ? TRACKING_RESOLVED_CARD_CLASS : ''}`}
    >
      <CardHeader onClick={onToggle} className="relative flex items-center justify-between px-4 py-3 pb-0 cursor-pointer select-none">
        <div className="text-[15px] sm:text-base font-semibold text-surface-light">{title}</div>

        {/* Timer, indicators and menu, aligned in the top right. */}
        <div className="absolute top-0 right-0 pt-3 pr-3 flex items-center gap-2 box-content h-6">
          <div className="ui-timer text-sm sm:text-[15px] font-semibold text-surface-light">{timer}</div>
          {indicators}
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
                {[
                  <DropdownItem key="showLog" onPress={onToggle}>
                    {expanded ? t('Hide Log') : t('Show Log')}
                  </DropdownItem>,
                  ...actions.map((a) => (
                    <DropdownItem
                      key={a.key}
                      isDisabled={a.isDisabled}
                      onPress={a.onPress}
                      {...(a.danger ? { className: 'text-danger', color: 'danger' as const } : {})}
                    >
                      {a.label}
                    </DropdownItem>
                  )),
                ]}
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}
