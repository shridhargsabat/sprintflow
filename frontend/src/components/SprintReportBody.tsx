import { GLASS_PANEL } from '../constants';
import { formatShortDate } from '../utils/format';
import { resolveSprintName } from '../utils/sprint';
import type { SprintConfig, SprintReport, SprintReportMovedTask, SprintReportTask, SprintStatus } from '../types';
import { SprintStatusBadge } from './SprintStatusBadge';
import { PointsBadge } from './PointsBadge';

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
      <PointsBadge>
        {pts(task.points)}
      </PointsBadge>
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

/**
 * Shared sprint-report body: header line (dates, totals, status) plus the
 * completed / moved-out / moved-in / remaining sections. Rendered by the
 * Reports view (and the legacy SprintReportModal shell). Pure presentational
 * component — fetching + loading/error states live with the caller.
 */
export function SprintReportBody({ report, sprints }: { report: SprintReport; sprints: SprintConfig[] }) {
  const status: SprintStatus = report.sprint.status ?? 'planned';
  const nameOf = (ref: string | null): string => (ref === null ? '—' : resolveSprintName(sprints, ref));

  return (
    <div data-testid="sprint-report" className={`rounded-[32px] overflow-hidden p-6 space-y-4 ${GLASS_PANEL}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          {formatShortDate(report.sprint.startDate)} – {formatShortDate(report.sprint.endDate)} · {report.sprint.lengthDays} working days ·{' '}
          {report.totals.tasks} {report.totals.tasks === 1 ? 'task' : 'tasks'} · {pts(report.totals.points)}
        </p>
        <SprintStatusBadge status={status} />
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
    </div>
  );
}
