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
  TeamStatusText,
  TeamControlsRow,
  TeamMapButton,
  TeamActionsMenu,
  TeamMemberList,
  TeamActivityLog,
} from './teamcardparts';

// Compact team card: one-line name/status/location header; controls,
// members, timer and activity log all revealed on expand. Shared pieces live
// in teamcardparts.tsx.
export default function TeamCardCondensed(props: TeamCardProps) {
  const { staff, event, sinceMs, onStatusChange, onLocationChange, updateEvent, hasVenueMap } = props;
  const { t } = useDispatchTerms();
  const [expanded, setExpanded] = useState(false);
  const timer = useMMSS(sinceMs);
  const model = useTeamStatusModel(staff, event);

  return (
    <Card
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-lg bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'}`}
      data-testid={`team-card-condensed-${staff.team}`}
    >
      {/* COLLAPSED HEADER - Single compact line */}
      <CardHeader
        onClick={() => setExpanded(v => !v)}
        className="relative flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-semibold text-surface-light truncate">
            {staff.team}
          </span>
          <span className={`text-sm font-bold truncate flex items-center gap-1 min-w-0 ${model.statusTone.textClass}`}>
            <TeamStatusText status={staff.status} iconType={model.teamEquipmentIconType} />
          </span>
          <span className="text-sm text-surface-faint truncate">
            {staff.location ? t(staff.location) : t('No location')}
          </span>
        </div>

        <div className="text-surface-light/70">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
        {hasVenueMap && <TeamMapButton {...props} />}
        <TeamActionsMenu {...props} />
      </CardHeader>

      <DispatchMotionCell isOpen={expanded} animate={true} className="px-3 pb-3 pt-0 space-y-3" overflowVisibleWhenOpen>
        <CardBody className="px-0 py-0" aria-hidden={!expanded}>
          <TeamControlsRow
            staff={staff}
            event={event}
            model={model}
            onStatusChange={onStatusChange}
            onLocationChange={onLocationChange}
          />

          {/* Team members and timer row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-surface-light pt-2 mb-1">{t('Team Members')}</div>
              <TeamMemberList staff={staff} className="space-y-0.5" />
            </div>
            <div className="flex-shrink-0 pt-2">
              <div className="text-base font-semibold text-surface-light tabular-nums">
                {timer}
              </div>
            </div>
          </div>

          <div onClick={e => e.stopPropagation()}>
            <div className="text-xs font-semibold text-surface-light pt-2 mb-1">{t('Activity Log')}</div>
            <TeamActivityLog staff={staff} event={event} updateEvent={updateEvent} compact />
          </div>
        </CardBody>
      </DispatchMotionCell>
    </Card>
  );
}
