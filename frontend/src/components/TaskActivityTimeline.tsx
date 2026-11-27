import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../api';
import { PRIORITY_META, STATUS_COLUMNS } from '../constants';
import { formatRelativeTime } from '../utils/format';
import { resolveSprintName } from '../utils/sprint';
import type { SprintConfig, TaskActivityEntry, TaskPriority, TaskStatus } from '../types';

interface TaskActivityTimelineProps {
  taskId: string;
  sprints: SprintConfig[];
}

/** Stored old/new for assignees/tags are JSON name arrays; fall back to raw. */
function listDisplay(raw: string | null): string {
  if (raw === null || raw === undefined) return 'none';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const names = parsed.filter((v): v is string => typeof v === 'string');
      return names.length > 0 ? names.join(', ') : 'none';
    }
  } catch {
    /* not JSON — fall through to raw */
  }
  const trimmed = raw.trim();
  return trimmed === '' ? 'none' : trimmed;
}

function statusLabel(id: string | null): string {
  return STATUS_COLUMNS.find(s => s.id === (id as TaskStatus))?.label ?? (id || 'none');
}

function priorityLabel(id: string | null): string {
  const meta = PRIORITY_META[id as TaskPriority];
  return meta?.label ?? (id || 'none');
}

function pointsLabel(raw: string | null): string {
  if (raw === null || raw === undefined || raw === '') return 'none';
  return `${raw} ${raw === '1' ? 'pt' : 'pts'}`;
}

function valueDisplay(field: string, raw: string | null, sprints: SprintConfig[]): string {
  switch (field) {
    case 'sprint':
      return raw ? resolveSprintName(sprints, raw) : 'none';
    case 'status':
      return statusLabel(raw);
    case 'priority':
      return priorityLabel(raw);
    case 'points':
      return pointsLabel(raw);
    case 'assignees':
    case 'tags':
      return listDisplay(raw);
    case 'dueDate':
      return raw && raw.trim() !== '' ? raw : 'none';
    case 'title':
      return raw && raw.trim() !== '' ? `“${raw}”` : 'none';
    case 'description':
      return raw && raw.trim() !== '' ? 'description' : 'empty';
    default:
      return raw ?? 'none';
  }
}

function entrySentence(entry: TaskActivityEntry, sprints: SprintConfig[]): string {
  const actor = entry.actor && entry.actor.trim() !== '' ? entry.actor : 'Someone';
  if (entry.action === 'created') return `${actor} created this task`;
  if (entry.action === 'deleted') return `${actor} deleted this task`;
  if (entry.action === 'rollover') {
    const from = valueDisplay('sprint', entry.oldValue, sprints);
    const to = valueDisplay('sprint', entry.newValue, sprints);
    return `${actor} moved task from ${from} to ${to}`;
  }
  if (entry.action === 'link') {
    const what = entry.field === 'related' ? 'related task' : 'subtask';
    if (entry.newValue && !entry.oldValue) return `${actor} linked ${what} ${entry.newValue}`;
    if (entry.oldValue && !entry.newValue) return `${actor} unlinked ${what} ${entry.oldValue}`;
    return `${actor} changed ${what} link`;
  }
  const field = entry.field ?? '';
  const from = valueDisplay(field, entry.oldValue, sprints);
  const to = valueDisplay(field, entry.newValue, sprints);
  switch (field) {
    case 'sprint':
      return `${actor} moved task from ${from} to ${to}`;
    case 'status':
      return `${actor} set status ${from} → ${to}`;
    case 'priority':
      return `${actor} set priority ${from} → ${to}`;
    case 'points':
      return `${actor} set points ${from} → ${to}`;
    case 'assignees':
      return `${actor} changed assignees ${from} → ${to}`;
    case 'tags':
      return `${actor} changed tags ${from} → ${to}`;
    case 'dueDate':
      return `${actor} set due date ${from} → ${to}`;
    case 'title':
      return `${actor} renamed task ${from} → ${to}`;
    case 'description':
      return `${actor} updated the description`;
    default:
      return `${actor} updated ${field || 'the task'}`;
  }
}

export function TaskActivityTimeline({ taskId, sprints }: TaskActivityTimelineProps) {
  const [entries, setEntries] = useState<TaskActivityEntry[] | null>(null);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setFailed(false);
    api.getTaskActivity(taskId)
      .then(data => { if (!cancelled) setEntries(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [taskId]);

  return (
    <div data-testid="task-activity">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" />
        Activity
      </p>
      {failed ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">Activity unavailable right now</p>
      ) : entries === null ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">Loading activity…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">No recorded activity yet</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(entry => (
            <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-slate-700 dark:text-slate-200">{entrySentence(entry, sprints)}</span>
              <span
                className="shrink-0 text-xs text-slate-400 dark:text-slate-500 pt-0.5"
                title={entry.createdAt}
              >
                {formatRelativeTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TaskActivityTimeline;
