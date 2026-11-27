import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { api } from '../api';
import type { SprintConfig, SprintReport } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { SprintReportBody } from './SprintReportBody';

interface SprintReportModalProps {
  sprintId: string;
  sprints: SprintConfig[];
  onClose: () => void;
}

export function SprintReportModal({ sprintId, sprints, onClose }: SprintReportModalProps) {
  useEscapeKey(onClose);
  const [report, setReport] = useState<SprintReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError(null);
    api.getSprintReport(sprintId).then(
      r => { if (!cancelled) setReport(r); },
      (e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load report'); }
    );
    return () => { cancelled = true; };
  }, [sprintId]);

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={report ? `Sprint report for ${report.sprint.name}` : 'Sprint report'}
        className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}
      >
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">REPORT</span>
            <h3 className="text-base font-semibold truncate">{report ? report.sprint.name : 'Sprint report'}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close report" className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scroll-slim">
          {error !== null && (
            <div className="px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30">
              {error}
            </div>
          )}
          {report === null && error === null && (
            <div className="py-10 text-center text-xs text-slate-400">Loading report…</div>
          )}
          {report !== null && <SprintReportBody report={report} sprints={sprints} />}
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
