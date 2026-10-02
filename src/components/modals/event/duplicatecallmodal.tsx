'use client';

import React, { useMemo } from 'react';
import { Button } from '@heroui/react';
import type { Call } from '@/app/types';

const CLOSED_STATUSES = ['Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Resolved'];

type DuplicateCallModalProps = {
  duplicateCallId: string;
  calls: Call[];
  callDisplayNumberMap: Map<string, number>;
  onSelectOriginal: (duplicateCallId: string, originalCallId: string) => void;
  onClose: () => void;
};

/** Picks which still-open call a call marked "duplicate" duplicates. */
export default function DuplicateCallModal({
  duplicateCallId,
  calls,
  callDisplayNumberMap,
  onSelectOriginal,
  onClose,
}: DuplicateCallModalProps) {
  const candidates = useMemo(
    () =>
      calls
        .filter(call => call.id !== duplicateCallId && !CLOSED_STATUSES.includes(call.status))
        .sort((a, b) => parseInt(a.id) - parseInt(b.id)),
    [calls, duplicateCallId]
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-deepest border border-surface-liner text-surface-light rounded-lg p-6 w-full max-w-2xl shadow-xl space-y-4"
      >
        <h2 className="text-2xl font-bold text-surface mb-4">Select Original Call</h2>
        <p className="text-surface-light mb-4">
          Call #{callDisplayNumberMap.get(duplicateCallId)} is a duplicate of which call?
        </p>
        <div className="max-h-80 overflow-y-auto border border-surface-liner rounded">
          <table className="w-full text-sm">
            <thead className="bg-surface-deep sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-surface-light">Call #</th>
                <th className="px-3 py-2 text-left text-surface-light">Chief Complaint</th>
                <th className="px-3 py-2 text-left text-surface-light">Age</th>
                <th className="px-3 py-2 text-left text-surface-light">Sex</th>
                <th className="px-3 py-2 text-left text-surface-light">Location</th>
                <th className="px-3 py-2 text-left text-surface-light">Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(call => (
                <tr key={call.id} className="border-b border-surface-liner hover:bg-surface-deep">
                  <td className="px-3 py-2">{callDisplayNumberMap.get(call.id)}</td>
                  <td className="px-3 py-2">{call.chiefComplaint || 'N/A'}</td>
                  <td className="px-3 py-2">{call.age || 'N/A'}</td>
                  <td className="px-3 py-2">{call.gender || 'N/A'}</td>
                  <td className="px-3 py-2">{call.location || 'N/A'}</td>
                  <td className="px-3 py-2">
                    <Button
                      onClick={() => onSelectOriginal(duplicateCallId, call.id)}
                      className="px-3 py-1 bg-status-red hover:bg-status-red/80 text-surface-light rounded text-sm"
                    >
                      Select
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {candidates.length === 0 && (
          <p className="text-surface-light text-center py-4">No active calls available to mark as original.</p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button
            onClick={onClose}
            className="px-4 py-2 rounded bg-surface-deep hover:bg-surface-liner text-surface-light"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
