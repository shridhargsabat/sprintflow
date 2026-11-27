import { useState } from 'react';
import { ArrowUpToLine, Calendar, Pencil, Plus, X } from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../auth/usePermissions';
import { GLASS_PILL, PRIORITY_META, STATUS_COLUMNS } from '../constants';
import { getDueMeta, getInitials } from '../utils/format';
import type { Task, SprintConfig, TaskLinkKind, TaskLinkSummary, ToastType } from '../types';
import GlassTooltip from './GlassTooltip';
import AssigneeCluster, { assigneeColor } from './AssigneeCluster';
import Dropdown from './Dropdown';
import TaskActivityTimeline from './TaskActivityTimeline';
import { Modal, MODAL_CLOSE_BUTTON_CLASS } from './Modal';
import { EyebrowBadge } from './EyebrowBadge';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { resolveSprintName } from '../utils/sprint';

interface TaskDetailsModalProps {
  task: Task;
  tasks: Task[];
  sprints: SprintConfig[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: (taskId: string) => void;
  onPromote: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onAddSubtask: (task: Task) => void;
  onChanged: () => void;
  showToast: (message: string, type?: ToastType) => void;
}

function LinkRow({ summary, testIdPrefix, onOpen, onUnlink }: {
  summary: TaskLinkSummary;
  testIdPrefix: string;
  onOpen: (id: string) => void;
  onUnlink: (() => void) | null;
}) {
  const meta = STATUS_COLUMNS.find(s => s.id === summary.status);
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta?.dot ?? 'bg-slate-400'}`} />
      <button
        type="button"
        onClick={() => onOpen(summary.id)}
        data-testid={`${testIdPrefix}-${summary.id}`}
        className="flex-1 min-w-0 min-h-[44px] md:min-h-0 flex items-center gap-1.5 text-left text-sm truncate hover:underline"
      >
        <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">{summary.id}</span>
        <span className="truncate">{summary.title}</span>
      </button>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{summary.points} {summary.points === 1 ? 'pt' : 'pts'}</span>
      {onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          aria-label={`Unlink ${summary.id}`}
          data-testid={`${testIdPrefix}-unlink-${summary.id}`}
          className="shrink-0 w-11 h-11 md:w-7 md:h-7 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

export function TaskDetailsModal({ task, tasks, sprints, onClose, onEdit, onDelete, onPromote, onOpenTask, onAddSubtask, onChanged, showToast }: TaskDetailsModalProps) {
  useEscapeKey(onClose);
  const { can } = usePermissions();
  const canEdit = can('tasks.edit');
  const [linking, setLinking] = useState<TaskLinkKind | null>(null);

  const statusMeta = STATUS_COLUMNS.find(s => s.id === task.status);
  const priorityMeta = PRIORITY_META[task.priority];
  const dueMeta = getDueMeta(task.dueDate, task.status);
  const description = task.description?.trim() ?? '';
  const assignees = task.assignees ?? [];
  const subtasks = task.subtasks ?? [];
  const related = task.related ?? [];
  const doneSubtasks = subtasks.filter(s => s.status === 'done').length;
  const subtaskPoints = subtasks.reduce((n, s) => n + (Number(s.points) || 0), 0);

  const subtaskOptions = tasks
    .filter(t => t.id !== task.id && t.id !== task.parent?.id && !subtasks.some(s => s.id === t.id))
    .map(t => ({ value: t.id, label: `${t.id} — ${t.title}` }));
  const relatedOptions = tasks
    .filter(t => t.id !== task.id && !related.some(r => r.id === t.id))
    .map(t => ({ value: t.id, label: `${t.id} — ${t.title}` }));

  const handleLink = async (linkedId: string, kind: TaskLinkKind): Promise<void> => {
    setLinking(null);
    try {
      await api.addTaskLink(task.id, linkedId, kind);
      onChanged();
      showToast(`Linked ${linkedId}`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to link task', 'error');
    }
  };

  const handleUnlink = async (linkedId: string, kind: TaskLinkKind): Promise<void> => {
    try {
      await api.removeTaskLink(task.id, linkedId, kind);
      onChanged();
      showToast(`Unlinked ${linkedId}`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to unlink task', 'error');
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="task-details-title"
      headerClassName="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-3"
      bodyClassName="p-6 space-y-5"
      closeButton={
        <GlassTooltip label="Close details" position="bottom">
          <button type="button" onClick={onClose} className={`shrink-0 ${MODAL_CLOSE_BUTTON_CLASS}`} aria-label="Close details">
            <X className="w-4 h-4" />
          </button>
        </GlassTooltip>
      }
      title={
        <div className="flex items-center gap-2 min-w-0">
          <EyebrowBadge>{task.id}</EyebrowBadge>
          <h3 id="task-details-title" className="text-base font-semibold truncate">{task.title}</h3>
        </div>
      }
      footer={
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
      }
    >
          {task.parent && (
            <div data-testid="task-parent" className="flex items-center gap-2 text-sm min-w-0">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Parent:</span>
              <button
                type="button"
                onClick={() => onOpenTask(task.parent!.id)}
                className="min-w-0 truncate px-2.5 py-1 rounded-full text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-500/15 border border-blue-400/30 hover:bg-blue-500/25 min-h-[44px] md:min-h-0"
              >
                {task.parent.id} — {task.parent.title}
              </button>
            </div>
          )}

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
            {(task.tags ?? []).map(name => (
              <span key={name} className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${GLASS_PILL}`}>
                {name}
              </span>
            ))}
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

          <div data-testid="task-subtasks">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
              Subtasks ({doneSubtasks}/{subtasks.length}{subtasks.length > 0 ? ` · ${subtaskPoints} ${subtaskPoints === 1 ? 'pt' : 'pts'}` : ''})
            </p>
            {subtasks.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500">No subtasks yet</p>
            ) : (
              <ul className="space-y-1">
                {subtasks.map(s => (
                  <LinkRow
                    key={s.id}
                    summary={s}
                    testIdPrefix="subtask"
                    onOpen={onOpenTask}
                    onUnlink={canEdit ? () => { void handleUnlink(s.id, 'subtask'); } : null}
                  />
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAddSubtask(task)}
                  data-testid="subtask-add"
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add subtask
                </button>
                {linking === 'subtask' ? (
                  <Dropdown
                    searchable
                    searchPlaceholder="Search tasks…"
                    placeholder="Pick a task…"
                    value=""
                    onChange={(v) => { if (v) void handleLink(v, 'subtask'); }}
                    options={subtaskOptions}
                    className="inline-flex min-w-[220px] max-w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLinking('subtask')}
                    data-testid="subtask-link"
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}
                  >
                    Link existing…
                  </button>
                )}
              </div>
            )}
          </div>

          <div data-testid="task-related">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
              Related ({related.length})
            </p>
            {related.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500">No related tasks</p>
            ) : (
              <ul className="space-y-1">
                {related.map(r => (
                  <LinkRow
                    key={r.id}
                    summary={r}
                    testIdPrefix="related"
                    onOpen={onOpenTask}
                    onUnlink={canEdit ? () => { void handleUnlink(r.id, 'related'); } : null}
                  />
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {linking === 'related' ? (
                  <Dropdown
                    searchable
                    searchPlaceholder="Search tasks…"
                    placeholder="Pick a task…"
                    value=""
                    onChange={(v) => { if (v) void handleLink(v, 'related'); } }
                    options={relatedOptions}
                    className="inline-flex min-w-[220px] max-w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLinking('related')}
                    data-testid="related-link"
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}
                  >
                    Link related…
                  </button>
                )}
              </div>
            )}
          </div>

          <TaskActivityTimeline taskId={task.id} sprints={sprints} />
    </Modal>
  );
}

export default TaskDetailsModal;
