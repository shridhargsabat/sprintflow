import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, DEFAULT_POINTS_SCALE } from '../constants';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface PointsScaleModalProps {
  scale: number[];
  onClose: () => void;
  onSave: (scale: number[]) => void;
}

function parseScaleInput(raw: string): { values: number[]; error: string | null } {
  const parts = raw.split(',').map(s => s.trim()).filter(s => s !== '');
  if (parts.length === 0) return { values: [], error: 'Enter at least one value.' };
  if (parts.length > 30) return { values: [], error: 'Too many values (max 30).' };
  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return { values: [], error: `"${part}" is not a whole number.` };
    const n = Number(part);
    if (n < 1 || n > 50) return { values: [], error: `Values must be 1–50 (got ${n}).` };
    values.push(n);
  }
  if (new Set(values).size !== values.length) {
    return { values: [], error: 'Values must be unique (no duplicates).' };
  }
  return { values, error: null };
}

export function PointsScaleModal({ scale, onClose, onSave }: PointsScaleModalProps) {
  useEscapeKey(onClose);
  const [raw, setRaw] = useState<string>(scale.join(', '));

  const { values, error } = useMemo(() => parseScaleInput(raw), [raw]);
  const sorted = useMemo(() => [...values].sort((a, b) => a - b), [values]);
  const dirty = !error && (sorted.join(',') !== [...scale].sort((a, b) => a - b).join(','));
  const isDefault = !error && sorted.join(',') === DEFAULT_POINTS_SCALE.join(',');

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-400/30">POINTS</span>
            <h3 className="text-base font-semibold">Story Points Scale</h3>
          </div>
          <button type="button" onClick={onClose} className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scroll-slim">
          <div className="rounded-2xl bg-white/60 dark:bg-white/[0.06] border border-white/80 dark:border-white/15 p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Scale values (comma-separated)</label>
              <input
                type="text"
                value={raw}
                inputMode="numeric"
                onChange={e => setRaw(e.target.value)}
                placeholder="e.g. 1, 2, 3, 5, 8, 13"
                aria-label="Points scale values"
                className="w-full rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                Whole numbers 1–50, up to 30 values. These feed the task picker; existing tasks keep their points.
              </p>
            </div>
            {error ? (
              <div className="px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30">
                {error}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Scale preview">
                {sorted.map(v => (
                  <span
                    key={v}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-violet-500/15 text-violet-700 dark:text-violet-200 border border-violet-400/30"
                  >
                    {v} {v === 1 ? 'pt' : 'pts'}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                disabled={isDefault}
                onClick={() => setRaw(DEFAULT_POINTS_SCALE.join(', '))}
                className={`px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Reset to default
              </button>
              <button
                type="button"
                disabled={!dirty}
                onClick={() => onSave(sorted)}
                className="px-5 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save Scale
              </button>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
