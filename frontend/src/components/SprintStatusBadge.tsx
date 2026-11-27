import type { SprintStatus } from '../types';

export const STATUS_BADGE: Record<SprintStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30',
  planned: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-400/30',
  closed: 'bg-slate-900/10 dark:bg-white/10 text-slate-500 dark:text-slate-400 border border-slate-400/20'
};

export const STATUS_LABEL: Record<SprintStatus, string> = {
  active: 'Active',
  planned: 'Planned',
  closed: 'Closed'
};

/** Shared sprint-status pill (SprintReportBody + SprintSettingsModal copies). */
export function SprintStatusBadge({ status }: { status: SprintStatus }) {
  return (
    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default SprintStatusBadge;
