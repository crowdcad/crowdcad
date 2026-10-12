'use client';

import React from 'react';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

interface TrackingTableBaseProps {
  TableColGroup: React.ComponentType;
  showStatusColumn: boolean;
  showTeamAssignmentChips: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export default function TrackingTableBase({
  TableColGroup,
  showStatusColumn,
  showTeamAssignmentChips,
  children,
  footer,
  className,
}: TrackingTableBaseProps) {
  const { t } = useDispatchTerms();
  return (
    <div className={`w-full h-full flex flex-col min-h-0 ${className || ''}`.trim()} data-team-chips={showTeamAssignmentChips ? 'on' : 'off'}>
      <div className="flex-1 min-h-0 overflow-auto minimal-scrollbar">
        <table className="min-w-[870px] w-full text-[14px] sm:text-[15px] text-surface-light table-fixed border-separate border-spacing-0">
          <TableColGroup />
          <thead className="sticky top-0 z-10 bg-surface-deep">
            <tr className="border-b border-surface-liner">
              <th className="px-3 py-2.5 text-left text-surface-faint w-[5.25rem] whitespace-nowrap">{t('Call #')}</th>
              <th className="px-3 py-2.5 text-left text-surface-faint w-40">{t('Chief Complaint')}</th>
              <th className="px-3 py-2.5 text-left text-surface-faint w-16">{t('A/S')}</th>
              <th className="px-3 py-2.5 text-left text-surface-faint w-48">{t('Location')}</th>
              {showStatusColumn && <th className="px-3 py-2.5 text-left text-surface-faint w-40">{t('Status')}</th>}
              <th className="px-3 py-2.5 text-left text-surface-faint">{t('Team')}</th>
              <th className="px-3 py-2.5 text-right text-surface-faint w-12"></th>
            </tr>
          </thead>

          <tbody className="[&>tr>td]:border-b [&>tr>td]:border-surface-liner">{children}</tbody>
        </table>
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
