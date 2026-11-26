import { useState } from 'react';
import { X } from 'lucide-react';
import Calendar from './Calendar';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { formatShortDate } from '../utils/format';
import type { SprintConfig, SprintPatch } from '../types';

interface SprintSettingsModalProps {
  sprints: SprintConfig[];
  onClose: () => void;
  onSave: (id: string, patch: SprintPatch) => void;
}

const LENGTH_PRESETS: Array<{ label: string; days: number }> = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '3 weeks', days: 21 },
  { label: '4 weeks', days: 28 }
];

function SprintRow({ sprint, onSave }: { sprint: SprintConfig; onSave: (id: string, patch: SprintPatch) => void }) {
  const [startDate, setStartDate] = useState<string>(sprint.startDate);
  const [lengthDays, setLengthDays] = useState<number>(sprint.lengthDays);

  const dirty = startDate !== sprint.startDate || lengthDays !== sprint.lengthDays;

  return (
    <div className="rounded-2xl bg-white/60 dark:bg-white/[0.06] border border-white/80 dark:border-white/15 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{sprint.name}</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Currently {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)} · {sprint.lengthDays} days
          </p>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1">Start Date</label>
        <Calendar
          value={startDate}
          onChange={setStartDate}
          className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1">Sprint Length</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {LENGTH_PRESETS.map(p => (
            <button
              key={p.days}
              type="button"
              onClick={() => setLengthDays(p.days)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                lengthDays === p.days
                  ? 'bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-blue-500/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!dirty || !startDate}
          onClick={() => onSave(sprint.id, { startDate, lengthDays })}
          className="px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function SprintSettingsModal({ sprints, onClose, onSave }: SprintSettingsModalProps) {
  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">SPRINTS</span>
            <h3 className="text-base font-semibold">Sprint Settings</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {sprints.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">No sprints configured yet.</div>
          ) : (
            sprints.map(s => <SprintRow key={s.id} sprint={s} onSave={onSave} />)
          )}
          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold ${GLASS_PILL}`}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
