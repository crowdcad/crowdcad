'use client';

import React from 'react';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

interface TrackingTableBaseProps {
  /** Override the column sizing (e.g. the marketing demo). Defaults to widths derived from the header labels. */
  TableColGroup?: React.ComponentType;
  showStatusColumn: boolean;
  showTeamAssignmentChips: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

// The editable text cells (chief complaint, A/S, location) are a box the height of a team chip (h-8),
// with the table's own surface-deep fill, so inside an open (highlighted) row they read as fields. The
// box looks the same before and while editing; the negative margin keeps its text in line with the header.
const INLINE_CELL_BOX = 'h-8 w-[calc(100%+1rem)] -mx-2 px-2 rounded-sm bg-surface-deep text-surface-light';

/**
 * What an empty editable cell shows, muted like an input placeholder. It used to be "[Edit]", but the
 * box now says the cell is editable, and bracket glyphs hang below the baseline (3px at 15px in
 * Rajdhani, the condensed font), so they looked dropped next to the lowercase letters.
 */
export const INLINE_CELL_PLACEHOLDER = 'Edit';

/** The input an editable text cell turns into when clicked; give it `placeholder={INLINE_CELL_PLACEHOLDER}`. */
export const INLINE_CELL_INPUT_CLASS = `${INLINE_CELL_BOX} border-0 outline-none placeholder:text-surface-faint focus:outline-none focus:ring-0 focus-visible:outline-none`;

/**
 * An editable text cell before it is clicked. Clicking the box itself starts editing and leaves the row
 * as it is; the cell's padding around it still opens and closes the row like the rest of the row.
 */
export function InlineCellBox({ value, onEdit }: { value: string | null | undefined; onEdit: () => void }) {
  return (
    <div
      className={`${INLINE_CELL_BOX} flex cursor-text items-center`}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {value ? <span className="truncate">{value}</span> : <span className="text-surface-faint">{INLINE_CELL_PLACEHOLDER}</span>}
    </div>
  );
}

const ROW_CONTROLS = 'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="menuitem"]';

/**
 * Whether a click on a call/clinic table row should open or close it: anywhere in the row except a text
 * field or a control. Clicks from menus are ignored too: menus render in a portal outside the row, but
 * React still bubbles their clicks up through it (picking "Add Team" used to open the row). Controls are
 * only looked for inside the row, since an element around the table can carry one of those roles.
 */
export function isRowToggleClick(e: React.MouseEvent): boolean {
  const row = e.currentTarget as HTMLElement;
  const target = e.target as HTMLElement;
  if (!row.contains(target)) return false;
  const control = target.closest(ROW_CONTROLS);
  return !control || !row.contains(control);
}

// Header cells carry px-3 (0.75rem each side). Uppercase + letter-spacing in the condensed
// UI style runs wider than a "0", hence the per-character allowance.
const HEADER_PADDING_REM = 1.5;
const HEADER_CH_PER_CHAR = 1.2;

/** A column wide enough that its header label stays on one line, never narrower than `minRem`. */
function fitWidth(label: string, minRem: number): string {
  return `max(${minRem}rem, calc(${(label.length * HEADER_CH_PER_CHAR).toFixed(1)}ch + ${HEADER_PADDING_REM}rem))`;
}

/**
 * Column widths follow the active language preset's header strings, so a wider translation
 * grows its column instead of wrapping. The Team column stays flexible; the trailing actions
 * column has no label and keeps a fixed width.
 */
function FittedColGroup({ showStatusColumn }: { showStatusColumn: boolean }) {
  const { t } = useDispatchTerms();
  return (
    <colgroup>
      <col style={{ width: fitWidth(t('Call #'), 5.25) }} />
      <col style={{ width: fitWidth(t('Chief Complaint'), 11) }} />
      <col style={{ width: fitWidth(t('A/S'), 4) }} />
      <col style={{ width: fitWidth(t('Location'), 12) }} />
      {showStatusColumn && <col style={{ width: fitWidth(t('Status'), 10) }} />}
      <col />
      <col style={{ width: showStatusColumn ? '5rem' : '4.5rem' }} />
    </colgroup>
  );
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
          {TableColGroup ? <TableColGroup /> : <FittedColGroup showStatusColumn={showStatusColumn} />}
          <thead className="sticky top-0 z-10 bg-surface-deep">
            <tr className="border-b border-surface-liner">
              <th className="px-3 py-2.5 text-left text-surface-faint whitespace-nowrap">{t('Call #')}</th>
              <th className="px-3 py-2.5 text-left text-surface-faint whitespace-nowrap">{t('Chief Complaint')}</th>
              <th className="px-3 py-2.5 text-left text-surface-faint whitespace-nowrap">{t('A/S')}</th>
              <th className="px-3 py-2.5 text-left text-surface-faint whitespace-nowrap">{t('Location')}</th>
              {showStatusColumn && <th className="px-3 py-2.5 text-left text-surface-faint whitespace-nowrap">{t('Status')}</th>}
              <th className="px-3 py-2.5 text-left text-surface-faint whitespace-nowrap">{t('Team')}</th>
              <th className="px-3 py-2.5 text-right text-surface-faint"></th>
            </tr>
          </thead>

          <tbody className="[&>tr>td]:border-b [&>tr>td]:border-surface-liner">{children}</tbody>
        </table>
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
