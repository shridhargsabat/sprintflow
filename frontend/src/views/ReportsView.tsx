import { useEffect, useMemo, useState } from 'react';
import Dropdown from '../components/Dropdown';
import { SprintReportBody } from '../components/SprintReportBody';
import { api } from '../api';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { formatShortDate } from '../utils/format';
import type { SprintConfig, SprintReport } from '../types';

interface ReportsViewProps {
  sprints: SprintConfig[];
  /** Lifecycle-active sprint id (null until the board loads). */
  defaultSprintId: string | null;
  /** Open the task details modal for a report row (by task id). */
  onOpenDetails?: (taskId: string) => void;
}

const STATUS_SUFFIX: Record<string, string> = {
  active: ' • Active',
  planned: ' • Planned',
  closed: ' • Closed'
};

/**
 * Dedicated top-level Reports view (relocated out of Sprint Settings).
 * Sprint picker lists every sprint — open AND closed — defaulting to the
 * active sprint; the report renders via the shared SprintReportBody.
 */
export default function ReportsView({ sprints, defaultSprintId, onOpenDetails }: ReportsViewProps) {
  const [selectedId, setSelectedId] = useState<string>(defaultSprintId ?? '');
  const [report, setReport] = useState<SprintReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  // Sprint options mirror the FilterBar pattern (live list, stable ids as
  // values, dates in labels) — plus an explicit status suffix so closed/past
  // sprints are distinguishable in the picker.
  const sprintOptions = useMemo(
    () =>
      sprints.map(s => ({
        value: s.id,
        label: `${s.name} (${formatShortDate(s.startDate)} – ${formatShortDate(s.endDate)})${STATUS_SUFFIX[s.status] ?? ''}`
      })),
    [sprints]
  );

  // Adopt the active sprint once the board loads; re-resolve if the current
  // selection disappears (e.g. list refreshes under us).
  useEffect(() => {
    if (sprints.length === 0) return;
    if (selectedId === '' || !sprints.some(s => s.id === selectedId)) {
      const fallback =
        (defaultSprintId !== null && sprints.some(s => s.id === defaultSprintId) && defaultSprintId) ||
        sprints.find(s => s.status !== 'closed')?.id ||
        sprints[0].id;
      setSelectedId(fallback);
    }
  }, [sprints, defaultSprintId, selectedId]);

  useEffect(() => {
    if (selectedId === '') return;
    let cancelled = false;
    setReport(null);
    setError(null);
    api.getSprintReport(selectedId).then(
      r => { if (!cancelled) setReport(r); },
      (e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load report'); }
    );
    return () => { cancelled = true; };
  }, [selectedId, reloadKey]);

  return (
    <div data-testid="reports-view" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sprint Reports</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Completed, moved, and remaining work per sprint — including closed sprints</p>
        </div>
        {sprints.length > 0 && (
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <label htmlFor="reports-sprint-picker" className="text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">Sprint:</label>
            <div className="flex-1 sm:flex-none sm:min-w-72">
              <Dropdown
                id="reports-sprint-picker"
                value={selectedId}
                onChange={setSelectedId}
                options={sprintOptions}
                placeholder="Select sprint for report"
                className={`inline-flex w-full min-h-[44px] md:min-h-0 items-center justify-between gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ${GLASS_PILL}`}
              />
            </div>
          </div>
        )}
      </div>

      {sprints.length === 0 ? (
        <div className={`rounded-[32px] overflow-hidden p-6 ${GLASS_PANEL}`}>
          <p className="py-10 text-center text-xs text-slate-400">No sprints yet — create one in Sprint Settings to see its report here.</p>
        </div>
      ) : error !== null ? (
        <div className={`rounded-[32px] overflow-hidden p-6 space-y-3 ${GLASS_PANEL}`}>
          <p className="px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            className={`px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}
          >
            Retry
          </button>
        </div>
      ) : report === null ? (
        <div className={`rounded-[32px] overflow-hidden p-6 ${GLASS_PANEL}`}>
          <p className="py-10 text-center text-xs text-slate-400">Loading report…</p>
        </div>
      ) : (
        <SprintReportBody report={report} sprints={sprints} onOpenDetails={onOpenDetails} />
      )}
    </div>
  );
}
