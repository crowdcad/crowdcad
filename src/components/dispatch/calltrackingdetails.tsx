"use client";

import React from 'react';
import DispatchMotionCell from './motioncell';
import TrackingTextEntry from '@/components/dispatch/trackingtextentry';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

type Props = {
  callDisplayNumber: number | undefined;
  isOpen: boolean;
  notesText: string;
  onNotesChange: (value: string) => void;
  onNotesFocus: () => void;
  onNotesBlur: () => Promise<void>;
  logText: string;
  onLogChange: (value: string) => void;
  onLogFocus: () => void;
  onLogBlur: () => Promise<void>;
  onLogInsertTimestamp: () => void;
  onClose: () => void;
  rowClassName?: string;
};

export default function CallTrackingDetails({
  callDisplayNumber,
  isOpen,
  notesText,
  onNotesChange,
  onNotesFocus,
  onNotesBlur,
  logText,
  onLogChange,
  onLogFocus,
  onLogBlur,
  onLogInsertTimestamp,
  onClose,
  rowClassName,
}: Props) {
  const { t } = useDispatchTerms();
  return (
    <tr className={rowClassName}>
      <td
        colSpan={6}
        className="p-0 align-top !border-b-0"
        onClick={onClose}
      >
        <div
          className={`px-2 overflow-hidden transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? 'pt-1.5 pb-3' : 'pt-0 pb-0'
          }`}
        >
          <DispatchMotionCell isOpen={isOpen} animate={true} className="cursor-pointer" overflowVisibleWhenOpen>
            <div
              className="mt-0 mb-1.5 text-sm text-surface-light"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-semibold mb-1">{t('Notes')}</div>
              <TrackingTextEntry
                mode="note"
                filled
                value={notesText}
                onChange={(e) => onNotesChange(e.target.value)}
                onBlur={onNotesBlur}
                onFocus={onNotesFocus}
                minRows={2}
                maxRows={3}
                variant="flat"
                placeholder={t('Add notes')}
                className="min-w-0"
              />
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <strong>{t('Log for Call')} #{callDisplayNumber}:</strong>
              <TrackingTextEntry
                mode="log"
                filled
                value={logText}
                onChange={(e) => onLogChange(e.target.value)}
                onBlur={onLogBlur}
                onFocus={onLogFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onLogInsertTimestamp();
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
  );
}
