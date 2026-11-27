import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { formatShortDate } from '../utils/format';
import { resolveSprintName } from '../utils/sprint';
import { api } from '../api';
import type { SprintConfig, SprintReport, SprintReportMovedTask, SprintReportTask, SprintStatus } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface SprintReportModalProps {
  sprintId: string;
  sprints: SprintConfig[];
  onClose: () => void;
}

const STATUS_BADGE: Record<SprintStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30',
  planned: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-400/30',
  closed: 'bg-slate-900/10 dark:bg-white/10 text-slate-500 dark:text-slate-400 border border-slate-400/20'
};

const STATUS_LABEL: Record<SprintStatus, string> = {
  active: 'Active',
  planned: 'Planned',
  closed: 'Closed'
};

function pts(n: number): string {
  return `${n} ${n === 1 ? 'pt' : 'pts'}`;
}

function TaskRow({ task, detail }: { task: SprintReportTask | SprintReportMovedTask; detail?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl bg-slate-900/[0.04] dark:bg-black/20 border border-white/60 dark:border-white/10 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate">
          <span className="text-slate-500 dark:text-slate-400 font-medium">{task.id}</span>{' '}
          <span className="truncate">{task.title}</span>
        </p>
        {detail && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{detail}</p>}
      </div>
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">
        {pts(task.points)}
      </span>
    </li>
  );
}

function Section({
  testId,
  title,
  count,
  points,
  empty,
  children
}: {
  testId: string;
  title: string;
  count: number;
  points: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="rounded-2xl bg-white/60 dark:bg-white/[0.06] border border-white/80 dark:border-white/15 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h4>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {count} {count === 1 ? 'task' : 'tasks'} · {pts(points)}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-slate-400 py-2 text-center">{empty}</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </section>
  );
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

  const status: SprintStatus = report?.sprint.status ?? 'planned';
  const nameOf = (ref: string | null): string => (ref === null ? '—' : resolveSprintName(sprints, ref));

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={report ? `Sprint report for ${report.sprint.name}` : 'Sprint report'}
        data-testid="sprint-report"
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
          {report !== null && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {formatShortDate(report.sprint.startDate)} – {formatShortDate(report.sprint.endDate)} · {report.sprint.lengthDays} working days ·{' '}
                  {report.totals.tasks} {report.totals.tasks === 1 ? 'task' : 'tasks'} · {pts(report.totals.points)}
                </p>
                <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${STATUS_BADGE[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>

              <Section testId="report-completed" title="Completed" count={report.completed.count} points={report.completed.points} empty="No completed tasks yet">
                {report.completed.tasks.map(t => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Section>

              <Section testId="report-moved-out" title="Moved out" count={report.movedOut.count} points={report.movedOut.points} empty="No tasks moved out">
                {report.movedOut.tasks.map(t => (
                  <TaskRow key={t.id} task={t} detail={`Moved to ${nameOf(t.to)} · now in ${nameOf(t.sprint)}`} />
                ))}
              </Section>

              <Section testId="report-moved-in" title="Moved in" count={report.movedIn.count} points={report.movedIn.points} empty="No tasks moved in">
                {report.movedIn.tasks.map(t => (
                  <TaskRow key={t.id} task={t} detail={`Moved from ${nameOf(t.from)}`} />
                ))}
              </Section>

              <Section testId="report-remaining" title="Remaining unfinished" count={report.remainingUnfinished.count} points={report.remainingUnfinished.points} empty="No unfinished tasks remaining">
                {report.remainingUnfinished.tasks.map(t => (
                  <TaskRow key={t.id} task={t} detail={t.status.replace(/_/g, ' ')} />
                ))}
              </Section>
            </>
          )}
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
