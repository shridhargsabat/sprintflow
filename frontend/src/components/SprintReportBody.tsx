import { GLASS_PANEL, GLASS_SUBCARD } from '../constants';
import { formatShortDate } from '../utils/format';
import { resolveSprintName } from '../utils/sprint';
import type { SprintConfig, SprintReport, SprintReportMovedTask, SprintReportTask, SprintStatus } from '../types';

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

function TaskRow({
  task,
  detail,
  onOpenDetails
}: {
  task: SprintReportTask | SprintReportMovedTask;
  detail?: string;
  /** When set (Reports view), the row opens the task details modal. Omit for inert rows (legacy modal shell). */
  onOpenDetails?: (taskId: string) => void;
}) {
  const clickable = onOpenDetails !== undefined;
  return (
    <li
      onClick={clickable ? () => onOpenDetails(task.id) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetails(task.id); } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={task.title}
      className={`group flex items-center justify-between gap-2 rounded-xl bg-slate-900/[0.04] dark:bg-black/20 border border-white/60 dark:border-white/10 px-3 py-2 min-h-[44px]${clickable ? ' cursor-pointer hover:bg-white/60 dark:hover:bg-white/[0.08] transition-colors' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold break-words sm:truncate">
          <span className="text-slate-500 dark:text-slate-400 font-medium">{task.id}</span>{' '}
          <span className={`break-words sm:truncate${clickable ? ' group-hover:text-blue-600 dark:group-hover:text-blue-300' : ''}`}>{task.title}</span>
        </p>
        {detail && <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words sm:truncate">{detail}</p>}
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
  delay,
  children
}: {
  testId: string;
  title: string;
  count: number;
  points: number;
  empty: string;
  delay: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className={`lg-enter ${delay} rounded-2xl p-4 space-y-2 ${GLASS_SUBCARD}`}>
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

/**
 * Shared sprint-report body: header line (dates, totals, status) plus the
 * completed / moved-out / moved-in / remaining sections. Rendered by the
 * Reports view (and the legacy SprintReportModal shell). Pure presentational
 * component — fetching + loading/error states live with the caller.
 */
export function SprintReportBody({ report, sprints, onOpenDetails }: { report: SprintReport; sprints: SprintConfig[]; onOpenDetails?: (taskId: string) => void }) {
  const status: SprintStatus = report.sprint.status ?? 'planned';
  const nameOf = (ref: string | null): string => (ref === null ? '—' : resolveSprintName(sprints, ref));

  return (
    <div data-testid="sprint-report" className={`lg-enter lg-delay-2 rounded-[32px] overflow-hidden p-6 space-y-4 ${GLASS_PANEL}`}>
      <div className="lg-enter lg-delay-1 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          {formatShortDate(report.sprint.startDate)} – {formatShortDate(report.sprint.endDate)} · {report.sprint.lengthDays} working days ·{' '}
          {report.totals.tasks} {report.totals.tasks === 1 ? 'task' : 'tasks'} · {pts(report.totals.points)}
        </p>
        <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${STATUS_BADGE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <Section testId="report-completed" title="Completed" count={report.completed.count} points={report.completed.points} empty="No completed tasks yet" delay="lg-delay-1">
        {report.completed.tasks.map(t => (
          <TaskRow key={t.id} task={t} onOpenDetails={onOpenDetails} />
        ))}
      </Section>

      <Section testId="report-moved-out" title="Moved out" count={report.movedOut.count} points={report.movedOut.points} empty="No tasks moved out" delay="lg-delay-2">
        {report.movedOut.tasks.map(t => (
          <TaskRow key={t.id} task={t} detail={`Moved to ${nameOf(t.to)} · now in ${nameOf(t.sprint)}`} onOpenDetails={onOpenDetails} />
        ))}
      </Section>

      <Section testId="report-moved-in" title="Moved in" count={report.movedIn.count} points={report.movedIn.points} empty="No tasks moved in" delay="lg-delay-3">
        {report.movedIn.tasks.map(t => (
          <TaskRow key={t.id} task={t} detail={`Moved from ${nameOf(t.from)}`} onOpenDetails={onOpenDetails} />
        ))}
      </Section>

      <Section testId="report-remaining" title="Remaining unfinished" count={report.remainingUnfinished.count} points={report.remainingUnfinished.points} empty="No unfinished tasks remaining" delay="lg-delay-4">
        {report.remainingUnfinished.tasks.map(t => (
          <TaskRow key={t.id} task={t} detail={t.status.replace(/_/g, ' ')} onOpenDetails={onOpenDetails} />
        ))}
      </Section>
    </div>
  );
}
