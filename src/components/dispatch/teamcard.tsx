'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '@heroui/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import DispatchMotionCell from './motioncell';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { useMMSS } from '@/hooks/useMMSS';
import {
  type TeamCardProps,
  useTeamStatusModel,
  TeamControlsRow,
  TeamMapButton,
  TeamActionsMenu,
  TeamMemberList,
  TeamPostSchedule,
  TeamActivityLog,
} from './teamcardparts';

// Standard team card: name + timer header, status/location controls always
// visible, members and activity log revealed on expand. See
// teamcard-condensed.tsx for the compact layout; shared pieces live in
// teamcardparts.tsx.
export default function TeamCard(props: TeamCardProps) {
  const { staff, event, sinceMs, onStatusChange, onLocationChange, updateEvent, hasVenueMap, locationTracked, onPostAssignment } = props;
  const { t } = useDispatchTerms();
  const [expanded, setExpanded] = useState(false);
  const timer = useMMSS(sinceMs);
  const model = useTeamStatusModel(staff, event);

  return (
    <Card
      // Closed cards are transparent/sharp; open cards retain active dark shell.
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-lg bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'}`}
      data-testid={`team-card-${staff.team}`}
    >
      {/* HEADER (click to toggle). Not a <button>, so no nested <button> issues */}
      <CardHeader
        onClick={() => setExpanded(v => !v)}
        className="relative flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none"
      >
        <div className="min-w-0">
          <div className="text-[15px] sm:text-base font-semibold text-surface-light truncate">
            {staff.team}
          </div>
        </div>

        <div className="absolute top-3 right-3 flex items-center gap-2">
          <div className="text-surface-light/70">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
          {hasVenueMap && <TeamMapButton {...props} />}
          <div className="text-[15px] sm:text-base font-semibold text-surface-light tabular-nums">
            {timer}
          </div>
          <TeamActionsMenu {...props} />
        </div>
      </CardHeader>

      <CardBody className="px-4 pb-3 pt-0">
        <TeamControlsRow
          staff={staff}
          event={event}
          model={model}
          onStatusChange={onStatusChange}
          onLocationChange={onLocationChange}
          locationTracked={locationTracked}
        />

        <DispatchMotionCell isOpen={expanded} animate={true} className="mt-3" overflowVisibleWhenOpen>
          <div onClick={e => e.stopPropagation()} aria-hidden={!expanded}>
            {onPostAssignment ? (
              // TAK event with a posting schedule: the team's posts opposite its members (D66).
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-surface-light mb-1">{t('Team')}</div>
                  <TeamMemberList staff={staff} className="space-y-1" />
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-xs font-bold text-surface-light mb-1">{t('Post')}</div>
                  <TeamPostSchedule staff={staff} event={event} onPostAssignment={onPostAssignment} className="space-y-1" alignRight />
                </div>
              </div>
            ) : (
              <>
                <div className="text-xs font-bold text-surface-light mb-1">{t('Team')}</div>
                <TeamMemberList staff={staff} className="space-y-1 mb-3" />
              </>
            )}

            <div className="text-xs font-bold text-surface-light mb-1">{t('Activity Log')}</div>
            <TeamActivityLog staff={staff} event={event} updateEvent={updateEvent} />
          </div>
        </DispatchMotionCell>
      </CardBody>
    </Card>
  );
}
