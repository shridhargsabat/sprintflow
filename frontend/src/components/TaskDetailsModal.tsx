import { ArrowUpToLine, Calendar, Pencil, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, PRIORITY_META, STATUS_COLUMNS } from '../constants';
import { formatShortDate, getDueMeta, getInitials } from '../utils/format';
import type { Task, TeamMember } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface TaskDetailsModalProps {
  task: Task;
  member: TeamMember;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (taskId: string) => void;
  onPromote: (taskId: string) => void;
}

export function TaskDetailsModal({ task, member, onClose, onEdit, onDelete, onPromote }: TaskDetailsModalProps) {
  useEscapeKey(onClose);
  const statusMeta = STATUS_COLUMNS.find(s => s.id === task.status);
  const priorityMeta = PRIORITY_META[task.priority];
  const dueMeta = getDueMeta(task.dueDate, task.status);
  const description = task.description?.trim() ?? '';

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">{task.id}</span>
            <h3 className="text-base font-semibold truncate">{task.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center" aria-label="Close details">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
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
              {task.sprint}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${GLASS_PILL}`}>
              {task.points} {task.points === 1 ? 'pt' : 'pts'}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${GLASS_PILL}`}>
              {task.tag}
            </span>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/45 dark:bg-white/[0.05] border border-white/65 dark:border-white/10">
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${member.color}`}
            >
              {getInitials(member.name)}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assignee</p>
              <p className="text-sm font-semibold truncate">{member.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.role}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400">Due {formatShortDate(task.dueDate)}</span>
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

          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-2">
            <button type="button" onClick={() => onDelete(task.id)} className="px-4 py-2 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-500/10">Delete Task</button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold ${GLASS_PILL}`}>Close</button>
              {task.status === 'backlog' && (
                <button
                  type="button"
                  onClick={() => onPromote(task.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ${GLASS_PILL}`}
                >
                  <ArrowUpToLine className="w-3.5 h-3.5" />
                  Pull to Sprint
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Task
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailsModal;
