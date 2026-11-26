import { useMemo, useState } from 'react';
import type { Task, TaskStatus, TeamMember } from '../types';
import { GLASS_PANEL, GLASS_PILL, PRIORITY_META, STATUS_COLUMNS } from '../constants';
import { getDueMeta, getInitials } from '../utils/format';

interface BacklogViewProps {
  tasks: Task[];
  team: TeamMember[];
  onOpenTask: (task: Task | null, defaultStatus: TaskStatus) => void;
  onMoveTaskStatus: (taskId: string, status: TaskStatus) => void;
  onPromoteTask: (taskId: string) => void;
}

export default function BacklogView({ tasks, team, onOpenTask, onMoveTaskStatus, onPromoteTask }: BacklogViewProps) {
  const [backlogSort, setBacklogSort] = useState<string>('priority');

  const getMember = (id: string | null): TeamMember =>
    team.find(m => m.id === id) || { id: 'unassigned', name: 'Unassigned', role: 'Open', color: 'bg-slate-400' };

  const sortedBacklog = useMemo(() => {
    const statusOrder = { in_progress: 1, in_review: 2, todo: 3, backlog: 4, done: 5 };
    return tasks.slice().sort((a, b) => {
      if (backlogSort === 'priority') return PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight;
      if (backlogSort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      if (backlogSort === 'status') return (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
      if (backlogSort === 'points') return Number(b.points || 0) - Number(a.points || 0);
      return 0;
    });
  }, [tasks, backlogSort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Backlog &amp; Team Schedule</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Management overview of who owns what, when it is due, priority, and sprint status</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="backlog-sort" className="text-xs font-medium text-slate-600 dark:text-slate-400">Sort by:</label>
          <select id="backlog-sort" value={backlogSort} onChange={e => setBacklogSort(e.target.value)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${GLASS_PILL}`}>
            <option value="priority" className="text-slate-900">Priority (Highest first)</option>
            <option value="due" className="text-slate-900">Due Date (Soonest first)</option>
            <option value="status" className="text-slate-900">Status Workflow</option>
            <option value="points" className="text-slate-900">Story Points</option>
          </select>
        </div>
      </div>

      <div className={`lg-enter lg-delay-1 rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-900/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <th className="py-3.5 px-5">Task (What)</th>
                <th className="py-3.5 px-3">Assignee (Who)</th>
                <th className="py-3.5 px-3">Due Date (When)</th>
                <th className="py-3.5 px-3">Priority</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-3">Sprint / Pts</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.07] text-xs">
              {sortedBacklog.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-400">No tasks match your current filters.</td></tr>
              ) : sortedBacklog.map(t => {
                const m = getMember(t.assigneeId);
                const p = PRIORITY_META[t.priority];
                const due = getDueMeta(t.dueDate, t.status);
                const col = STATUS_COLUMNS.find(c => c.id === t.status) || STATUS_COLUMNS[0];
                return (
                  <tr key={t.id} className="hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors">
                    <td className="py-3.5 px-5 max-w-xs">
                      <div onClick={() => onOpenTask(t, t.status)} className="cursor-pointer group">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold text-slate-500">{t.id}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10">{t.tag}</span>
                        </div>
                        <p className="font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-300 truncate">{t.title}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full ${m.color} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>{getInitials(m.name)}</span>
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </td>
                    <td className={`py-3.5 px-3 whitespace-nowrap ${due.cls}`}>{due.text}</td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${p.pill}`}>{p.label}</span>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <select value={t.status} onChange={e => onMoveTaskStatus(t.id, e.target.value as TaskStatus)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${col.badge} cursor-pointer`}>
                        {STATUS_COLUMNS.map(s => <option key={s.id} value={s.id} className="text-slate-900">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className="font-semibold">{t.sprint}</span>
                      <span className="text-slate-500 dark:text-slate-400 ml-1">· {t.points} pts</span>
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {t.status === 'backlog' && (
                          <button type="button" onClick={() => onPromoteTask(t.id)} className="px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">
                            Pull to Sprint
                          </button>
                        )}
                        <button type="button" onClick={() => onOpenTask(t, t.status)} className={`px-3 py-1 rounded-full text-[11px] font-semibold ${GLASS_PILL}`}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
