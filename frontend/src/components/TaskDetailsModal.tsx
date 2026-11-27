import { ArrowUpToLine, Calendar, Pencil, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, PRIORITY_META, STATUS_COLUMNS } from '../constants';
import { getDueMeta, getInitials } from '../utils/format';
import type { Task, SprintConfig } from '../types';
import GlassTooltip from './GlassTooltip';
import AssigneeCluster, { assigneeColor } from './AssigneeCluster';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { resolveSprintName } from '../utils/sprint';

interface TaskDetailsModalProps {
  task: Task;
  sprints: SprintConfig[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: (taskId: string) => void;
  onPromote: (taskId: string) => void;
}

export function TaskDetailsModal({ task, sprints, onClose, onEdit, onDelete, onPromote }: TaskDetailsModalProps) {
  useEscapeKey(onClose);
  const statusMeta = STATUS_COLUMNS.find(s => s.id === task.status);
  const priorityMeta = PRIORITY_META[task.priority];
  const dueMeta = getDueMeta(task.dueDate, task.status);
  const description = task.description?.trim() ?? '';
  const assignees = task.assignees ?? [];

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="task-details-title" className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">{task.id}</span>
            <h3 id="task-details-title" className="text-base font-semibold truncate">{task.title}</h3>
          </div>
          <GlassTooltip label="Close details" position="bottom">
            <button type="button" onClick={onClose} className="shrink-0 w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center" aria-label="Close details">
              <X className="w-4 h-4" />
            </button>
          </GlassTooltip>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto scroll-slim">
          <div className="flex flex-wrap items-center gap-2">
            {statusMeta && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusMeta.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${priorityMeta.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priorityMeta.dot}`} />
              {priorityMeta.label}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${GLASS_PILL}`}>
              {resolveSprintName(sprints, task.sprint)}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${GLASS_PILL}`}>
              {task.points} {task.points === 1 ? 'pt' : 'pts'}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${GLASS_PILL}`}>
              {task.tag}
            </span>
          </div>

          <div className="px-4 py-3 rounded-2xl bg-white/45 dark:bg-white/[0.05] border border-white/65 dark:border-white/10">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Assignee{assignees.length === 1 ? '' : 's'}{assignees.length > 0 ? ` (${assignees.length})` : ''}
              </p>
              {assignees.length > 0 && <AssigneeCluster assignees={assignees} size="sm" />}
            </div>
            {assignees.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500">No assignees — unassigned</p>
            ) : (
              <ul className="space-y-2">
                {assignees.map((a, i) => (
                  <li key={`${a.type}-${String(a.id)}-${i}`} className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${assigneeColor(a)}`}>
                      {getInitials(a.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{a.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {[a.role, a.email].filter(Boolean).join(' · ') || (a.type === 'user' ? 'Login user' : 'Team member')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400">Due</span>
            <span className={`text-xs ${dueMeta.cls}`}>{dueMeta.text}</span>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Description</p>
            {description ? (
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{description}</p>
            ) : (
              <p className="text-sm italic text-slate-400 dark:text-slate-500">No description provided</p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2">
            <GlassTooltip label="Delete this task" className="flex md:inline-flex">
              <button type="button" onClick={() => onDelete(task.id)} className="w-full md:w-auto px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 text-rose-600 hover:bg-rose-500/10">Delete Task</button>
            </GlassTooltip>
            <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
              <button type="button" onClick={onClose} className={`w-full md:w-auto px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}>Close</button>
              {task.status === 'backlog' && (
                <GlassTooltip label="Pull into sprint" className="flex md:inline-flex">
                  <button
                    type="button"
                    onClick={() => onPromote(task.id)}
                    className={`w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}
                  >
                    <ArrowUpToLine className="w-3.5 h-3.5" />
                    Pull to Sprint
                  </button>
                </GlassTooltip>
              )}
              <GlassTooltip label="Edit this task" className="flex md:inline-flex">
                <button
                  type="button"
                  onClick={onEdit}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Task
                </button>
              </GlassTooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailsModal;
