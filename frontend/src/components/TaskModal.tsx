import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Dropdown, { type DropdownOption } from './Dropdown';
import Calendar from './Calendar';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { api, type Tag, type UserDirectoryEntry } from '../api';
import { usePermissions } from '../auth/usePermissions';
import { GLASS_PANEL, GLASS_PILL, DEFAULT_POINTS_SCALE, STATUS_COLUMNS } from '../constants';
import { resolveSprintName } from '../utils/sprint';
import type { AssigneeRef, AssigneeType, SprintConfig, Task, TaskFormValues, TaskPriority, TaskStatus, TeamMember } from '../types';

interface TaskModalProps {
  task: Task | null;
  defaultStatus: TaskStatus;
  defaultSprint: string;
  sprints: SprintConfig[];
  team: TeamMember[];
  pointsScale?: number[];
  onClose: () => void;
  onSave: (values: TaskFormValues) => void;
  onDelete: (taskId: string) => void;
}

function defaultPointsFor(scale: number[]): number {
  return scale.includes(3) ? 3 : scale[0] ?? 3;
}

/**
 * Normalize a stored sprint ref (stable id, or a legacy pre-rename name) to
 * the option value the picker uses — always a sprint id, or 'Backlog'.
 */
function toSprintOptionValue(sprints: SprintConfig[], ref: string): string {
  if (ref === 'Backlog') return 'Backlog';
  const byId = sprints.find(s => s.id === ref);
  if (byId) return byId.id;
  const byName = sprints.find(s => s.name === ref);
  if (byName) return byName.id;
  return ref;
}

export function TaskModal({ task, defaultStatus, defaultSprint, sprints, team, pointsScale, onClose, onSave, onDelete }: TaskModalProps) {
  useEscapeKey(onClose);
  const { can } = usePermissions();
  const canManage = can('team.manage');
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [extraMembers, setExtraMembers] = useState<TeamMember[]>([]);
  const [title, setTitle] = useState<string>(task ? task.title : '');
  const [description, setDescription] = useState<string>(task ? task.description || '' : '');
  const [assigneeKeys, setAssigneeKeys] = useState<string[]>(() =>
    (task?.assignees ?? []).map(a => `${a.type}:${String(a.id)}`)
  );
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [dirFailed, setDirFailed] = useState<boolean>(false);
  const [dueDate, setDueDate] = useState<string>(task ? task.dueDate : '2026-12-02');
  const [status, setStatus] = useState<TaskStatus>(task ? task.status : defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task ? task.priority : 'medium');
  const [sprint, setSprint] = useState<string>(() => {
    if (task) return toSprintOptionValue(sprints, task.sprint);
    if (defaultStatus === 'backlog') return 'Backlog';
    const normalized = toSprintOptionValue(sprints, defaultSprint);
    // Live-list-derived default: a stale/unknown default falls back to the
    // first live sprint id instead of a hardcoded name.
    if (normalized !== 'Backlog' && !sprints.some(s => s.id === normalized)) {
      return sprints.length > 0 ? sprints[0].id : normalized;
    }
    return normalized;
  });
  const scale = (pointsScale && pointsScale.length > 0 ? pointsScale : DEFAULT_POINTS_SCALE);
  const [points, setPoints] = useState<number>(task ? Number(task.points || 3) : defaultPointsFor(scale));
  const [tags, setTags] = useState<string[]>(task ? [...(task.tags ?? [])] : ['Frontend']);
  const [masterTags, setMasterTags] = useState<Tag[] | null>(null);
  const [tagsFailed, setTagsFailed] = useState<boolean>(false);

  // Fail-soft: if the tag master cannot load, fall back to a free-text input.
  useEffect(() => {
    let cancelled = false;
    api.listTags()
      .then(ts => { if (!cancelled) setMasterTags(ts); })
      .catch(() => { if (!cancelled) setTagsFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Fail-soft: if the directory cannot load, the picker offers team members only.
  useEffect(() => {
    let cancelled = false;
    api.listUserDirectory()
      .then(users => { if (!cancelled) setDirectory(users); })
      .catch(() => { if (!cancelled) setDirFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const handleCreateMember = async (name: string): Promise<DropdownOption | null> => {
    setPickerError(null);
    try {
      const created = await api.addMember({ name, role: 'Engineer' });
      setExtraMembers(prev => [...prev, created]);
      return {
        value: `member:${created.id}`,
        label: `${created.name} (${created.role || 'Team'})`,
        group: 'Team members'
      };
    } catch (e) {
      setPickerError(e instanceof Error ? `Couldn't add member: ${e.message}` : `Couldn't add member`);
      return null;
    }
  };

  const handleCreateTag = async (name: string): Promise<DropdownOption | null> => {
    setPickerError(null);
    try {
      const created = await api.createTag({ name });
      setMasterTags(prev => (prev === null ? [created] : [...prev, created]));
      return { value: created.name, label: created.name };
    } catch (e) {
      setPickerError(e instanceof Error ? `Couldn't add tag: ${e.message}` : `Couldn't add tag`);
      return null;
    }
  };

  const assigneeOptions: DropdownOption[] = [
    ...[...team, ...extraMembers].map(m => ({
      value: `member:${m.id}`,
      label: `${m.name} (${m.role || 'Team'})${m.linkedUser ? ` · ${m.linkedUser.email}` : ''}`,
      group: 'Team members'
    })),
    ...(dirFailed ? [] : directory.map(u => ({
      value: `user:${u.id}`,
      label: `${u.name} (${u.email})`,
      group: 'Login users'
    })))
  ];

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!title.trim()) return;
    const assignees: AssigneeRef[] = assigneeKeys.map(k => {
      const sep = k.indexOf(':');
      const type = k.slice(0, sep) as AssigneeType;
      const raw = k.slice(sep + 1);
      return { type, id: type === 'user' ? Number(raw) : raw };
    });
    onSave({
      id: task ? task.id : null,
      title: title.trim(),
      description: description.trim(),
      assignees,
      dueDate,
      status,
      priority,
      sprint,
      points: Number(points) || 3,
      tags
    });
  };

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">{task ? task.id : 'NEW'}</span>
            <h3 className="text-base font-semibold">{task ? 'Edit Sprint Task' : 'Create Sprint Task'}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scroll-slim">
          <div>
            <label className="block text-xs font-semibold mb-1">Task Title (What) *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl text-base md:text-sm bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl text-base md:text-xs bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Assignee (Who)</label>
            <Dropdown
              multi
              searchable
              value={assigneeKeys}
              onChange={setAssigneeKeys}
              options={assigneeOptions}
              placeholder="Select assignees…"
              searchPlaceholder="Search people…"
              onCreateNew={canManage ? handleCreateMember : undefined}
              createLabel={(q) => `Add team member "${q}"`}
              className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Due Date (When) *</label>
            <Calendar
              value={dueDate}
              onChange={setDueDate}
              className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Status</label>
              <Dropdown
                value={status}
                onChange={(v) => setStatus(v as TaskStatus)}
                options={STATUS_COLUMNS.map(s => ({ value: s.id, label: s.label }))}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Priority</label>
              <Dropdown
                value={priority}
                onChange={(v) => setPriority(v as TaskPriority)}
                options={[
                  { value: 'critical', label: 'Critical' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' }
                ]}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Sprint</label>
              <Dropdown
                value={sprint}
                onChange={setSprint}
                options={(() => {
                  const open = sprints.filter(s => s.status !== 'closed');
                  const opts = open.map(s => ({ value: s.id, label: `${s.name}${s.status === 'active' ? ' • Active' : ''}` }));
                  if (sprint !== '' && !opts.some(o => o.value === sprint) && sprint !== 'Backlog') {
                    opts.unshift({ value: sprint, label: `${resolveSprintName(sprints, sprint)} (closed)` });
                  }
                  opts.push({ value: 'Backlog', label: 'Backlog' });
                  return opts;
                })()}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Story Pts</label>
              <Dropdown
                value={String(points)}
                onChange={(v) => setPoints(Number(v))}
                options={(() => {
                  const opts = scale.map(pt => ({ value: String(pt), label: `${pt} ${pt === 1 ? 'pt' : 'pts'}` }));
                  // A task saved under an older scale keeps its value: keep it
                  // selectable so editing never silently drops it (tags pattern).
                  if (!scale.includes(points)) {
                    opts.unshift({ value: String(points), label: `${points} ${points === 1 ? 'pt' : 'pts'} (custom)` });
                  }
                  return opts;
                })()}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Workstream / Tags</label>
            {tagsFailed || (masterTags !== null && masterTags.length === 0) ? (
              <input
                type="text"
                value={tags.join(', ')}
                onChange={e => setTags(e.target.value.split(',').map(s => s.trim()).filter(s => s !== ''))}
                placeholder="Comma-separated tags (must match master list)"
                className="w-full px-3.5 py-2 rounded-2xl text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
            ) : (
              <Dropdown
                multi
                value={tags}
                onChange={setTags}
                searchable
                searchPlaceholder="Search tags…"
                onCreateNew={canManage ? handleCreateTag : undefined}
                createLabel={(q) => `Add tag "${q}"`}
                options={(() => {
                  const opts = (masterTags ?? []).map(t => ({ value: t.name, label: t.name }));
                  // While loading, or when the task holds legacy tags, keep the
                  // current values selectable so editing never loses them.
                  for (const current of tags) {
                    if (current !== '' && !opts.some(o => o.value === current)) {
                      opts.unshift({ value: current, label: masterTags === null ? current : `${current} (not in master)` });
                    }
                  }
                  return opts;
                })()}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
              />
            )}
          </div>
          {pickerError && (
            <div className="px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30">
              {pickerError}
            </div>
          )}
          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-2 flex-wrap">
            {task ? (
              <button type="button" onClick={() => onDelete(task.id)} className="px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 text-rose-600 hover:bg-rose-500/10">Delete Task</button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}>Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white">Save Task</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
