import React, { useState } from 'react';
import { X } from 'lucide-react';
import Dropdown from './Dropdown';
import Calendar from './Calendar';
import { GLASS_PANEL, GLASS_PILL, STATUS_COLUMNS } from '../constants';
import type { Task, TaskFormValues, TaskPriority, TaskStatus, TeamMember } from '../types';

interface TaskModalProps {
  task: Task | null;
  defaultStatus: TaskStatus;
  defaultSprint: string;
  team: TeamMember[];
  onClose: () => void;
  onSave: (values: TaskFormValues) => void;
  onDelete: (taskId: string) => void;
}

export function TaskModal({ task, defaultStatus, defaultSprint, team, onClose, onSave, onDelete }: TaskModalProps) {
  const [title, setTitle] = useState<string>(task ? task.title : '');
  const [description, setDescription] = useState<string>(task ? task.description || '' : '');
  const [assigneeId, setAssigneeId] = useState<string | null>(task ? task.assigneeId : (team[0] ? team[0].id : ''));
  const [dueDate, setDueDate] = useState<string>(task ? task.dueDate : '2026-12-02');
  const [status, setStatus] = useState<TaskStatus>(task ? task.status : defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task ? task.priority : 'medium');
  const [sprint, setSprint] = useState<string>(task ? task.sprint : (defaultStatus === 'backlog' ? 'Sprint 15' : defaultSprint));
  const [points, setPoints] = useState<number>(task ? Number(task.points || 3) : 3);
  const [tag, setTag] = useState<string>(task ? task.tag : 'Frontend');

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: task ? task.id : null,
      title: title.trim(),
      description: description.trim(),
      assigneeId,
      dueDate,
      status,
      priority,
      sprint,
      points: Number(points) || 3,
      tag
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
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold mb-1">Task Title (What) *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl text-sm bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Assignee (Who)</label>
              <Dropdown
                value={assigneeId || ''}
                onChange={setAssigneeId}
                options={team.map(m => ({ value: m.id, label: `${m.name} (${m.role || 'Team'})` }))}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Due Date (When) *</label>
              <Calendar
                value={dueDate}
                onChange={setDueDate}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Status</label>
              <Dropdown
                value={status}
                onChange={(v) => setStatus(v as TaskStatus)}
                options={STATUS_COLUMNS.map(s => ({ value: s.id, label: s.label }))}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
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
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Sprint</label>
              <Dropdown
                value={sprint}
                onChange={setSprint}
                options={[
                  { value: 'Sprint 14', label: 'Sprint 14' },
                  { value: 'Sprint 15', label: 'Sprint 15' },
                  { value: 'Backlog', label: 'Backlog' }
                ]}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Story Pts</label>
              <Dropdown
                value={String(points)}
                onChange={(v) => setPoints(Number(v))}
                options={[1, 2, 3, 5, 8, 13].map(pt => ({ value: String(pt), label: `${pt} ${pt === 1 ? 'pt' : 'pts'}` }))}
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Workstream / Tag</label>
            <Dropdown
              value={tag}
              onChange={setTag}
              options={[
                { value: 'Frontend', label: 'Frontend' },
                { value: 'Backend', label: 'Backend' },
                { value: 'API', label: 'API & Security' },
                { value: 'DevOps', label: 'DevOps & Infra' },
                { value: 'QA', label: 'QA & Testing' },
                { value: 'Design', label: 'UI/UX Design' }
              ]}
              className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15"
            />
          </div>
          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-2">
            {task ? (
              <button type="button" onClick={() => onDelete(task.id)} className="px-4 py-2 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-500/10">Delete Task</button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold ${GLASS_PILL}`}>Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white">Save Task</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
