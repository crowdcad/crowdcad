// components/debugmodal.tsx
import React from 'react';
import { X, ShieldAlert, Users, RotateCcw, Trash2, Copy } from '@/components/ui/icons';
import type { Event } from '@/app/types';

interface DebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPopulate: () => void;
  onReset: () => void;
  onClear: () => void;
  event?: Event | null;
}

export default function DebugModal({ isOpen, onClose, onPopulate, onReset, onClear, event }: DebugModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-deep border border-surface-liner w-full max-w-md rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-liner bg-surface-deepest">
          <div className="flex items-center gap-2 text-surface-light">
             <ShieldAlert className="w-5 h-5 text-status-red" />
             <h2 className="text-lg font-bold">Admin Actions</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-surface-light hover:text-surface-light hover:bg-surface-liner rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-3">
          <p className="text-xs text-surface-light/50 uppercase tracking-wider font-semibold mb-2">Testing Tools</p>
          
          <button
            onClick={onPopulate}
            className="flex items-center gap-3 w-full p-4 rounded-lg bg-surface-liner hover:bg-[#2a2a2a] text-left transition-colors group"
          >
            <div className="p-2 rounded bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-surface-light font-medium">Populate Test Data</div>
              <div className="text-xs text-surface-light/60">Adds Alpha, Bravo, and Charlie teams</div>
            </div>
          </button>

          <button
            onClick={onReset}
            className="flex items-center gap-3 w-full p-4 rounded-lg bg-surface-liner hover:bg-[#2a2a2a] text-left transition-colors group"
          >
             <div className="p-2 rounded bg-yellow-500/20 text-yellow-400 group-hover:bg-yellow-500/20">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="text-surface-light font-medium">Reset All Statuses</div>
              <div className="text-xs text-surface-light/60">Sets everyone to Available / Roaming</div>
            </div>
          </button>

          <div className="h-px bg-surface-liner my-2" />
          
          <button
            onClick={onClear}
            className="flex items-center gap-3 w-full p-4 rounded-lg bg-status-red/20 hover:bg-status-red/20 border border-status-red/20 text-left transition-colors group"
          >
             <div className="p-2 rounded bg-status-red/20 text-status-red group-hover:bg-status-red/30">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-status-red font-medium">Nuclear Clear</div>
              <div className="text-xs text-status-red/60">Deletes ALL calls and resets logs</div>
            </div>
          </button>

          <div className="h-px bg-surface-liner my-2" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-surface-light/50 uppercase tracking-wider font-semibold">Debug Snapshot</div>
              <button
                onClick={() => {
                  try {
                    const text = JSON.stringify(event || {}, null, 2);
                    navigator.clipboard.writeText(text);
                  } catch (e) {
                    console.error('copy failed', e);
                  }
                }}
                className="text-xs text-surface-light/60 hover:text-surface-light flex items-center gap-2"
                title="Copy JSON to clipboard"
              >
                <Copy className="w-4 h-4" /> Copy
              </button>
            </div>

            <div className="max-h-48 overflow-auto text-sm text-surface-light/80 bg-surface-deep rounded p-3 space-y-2">
              <div className="text-xs text-surface-faint">Event ID</div>
              <div className="font-mono text-[13px] text-surface-light">{event?.id ?? '—'}</div>

              <div className="text-xs text-surface-faint mt-2">Teams ({event?.staff?.length ?? 0})</div>
              <div className="text-[13px] text-surface-light">
                {(event?.staff || []).map(s => (
                  <div key={s.team} className="flex justify-between">
                    <div>{s.team}</div>
                    <div className="text-surface-faint">{s.status} @ {s.location || '—'}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-surface-faint mt-2">Supervisors ({event?.supervisor?.length ?? 0})</div>
              <div className="text-[13px] text-surface-light">
                {(event?.supervisor || []).map(s => (
                  <div key={s.team} className="flex justify-between">
                    <div>{s.team}</div>
                    <div className="text-surface-faint">{s.status} @ {s.location || '—'}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-surface-faint mt-2">Active Calls ({(event?.calls || []).length})</div>
              <div className="text-[13px] text-surface-light">
                {(event?.calls || []).slice(0,10).map(c => (
                  <div key={c.id} className="flex justify-between">
                    <div>#{c.order} {c.chiefComplaint || ''}</div>
                    <div className="text-surface-faint">{c.status} @ {c.location}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-surface-faint mt-2">Venue Equipment ({(event?.venue?.equipment || []).length})</div>
              <div className="text-[13px] text-surface-light">
                {(event?.venue?.equipment || []).map((e, idx) => {
                  const name = typeof e === 'string' ? e : e.name;
                  const loc = typeof e === 'string' ? '' : (e as { location?: string }).location || '';
                  return <div key={idx} className="flex justify-between"><div>{name}</div><div className="text-surface-faint">{loc || '—'}</div></div>;
                })}
              </div>

              <div className="text-xs text-surface-faint mt-2">Event Equipment ({(event?.eventEquipment || []).length})</div>
              <div className="text-[13px] text-surface-light">
                {(event?.eventEquipment || []).map(eq => (
                  <div key={eq.id} className="flex justify-between">
                    <div>{eq.name}</div>
                    <div className="text-surface-faint">{eq.status} {eq.assignedTeam ? `@ ${eq.assignedTeam}` : ''} {eq.location ? `• ${eq.location}` : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}