import GlassTooltip from './GlassTooltip';
import { getInitials } from '../utils/format';
import type { TaskAssignee } from '../types';

export type AssigneeClusterSize = 'xs' | 'sm' | 'md';

const SIZE_CLASS: Record<AssigneeClusterSize, string> = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
};

/** Stable `type:id` key shared by the TaskModal picker and the Who filter. */
export function assigneeKey(a: { type: string; id: string | number }): string {
  return `${a.type}:${String(a.id)}`;
}

export function assigneeColor(a: TaskAssignee): string {
  if (a.color) return a.color;
  return a.type === 'user' ? 'bg-indigo-500' : 'bg-slate-400';
}

export function assigneeLabel(a: TaskAssignee): string {
  return a.email ? `${a.name} (${a.email})` : a.name;
}

export function assigneeNames(assignees: TaskAssignee[] | undefined | null): string {
  return (assignees ?? []).map((a) => a.name).join(', ');
}

export interface AssigneeClusterProps {
  assignees: TaskAssignee[] | undefined | null;
  size?: AssigneeClusterSize;
  /** Max avatars before collapsing the rest into a `+N` bubble. */
  max?: number;
  emptyLabel?: string;
  className?: string;
}

/** Stacked avatar cluster (max N + `+N`) with a name tooltip per avatar. */
export default function AssigneeCluster({
  assignees,
  size = 'sm',
  max = 3,
  emptyLabel = 'Unassigned',
  className,
}: AssigneeClusterProps): React.JSX.Element {
  const list = assignees ?? [];
  if (list.length === 0) {
    return <span className="truncate text-[11px] italic text-slate-400 dark:text-slate-500">{emptyLabel}</span>;
  }
  const shown = list.slice(0, max);
  const rest = list.slice(max);
  const circle = SIZE_CLASS[size];
  return (
    <span className={`inline-flex shrink-0 items-center ${className ?? ''}`}>
      {shown.map((a, i) => (
        <GlassTooltip key={`${assigneeKey(a)}-${i}`} label={assigneeLabel(a)} className={`inline-flex ${i > 0 ? '-ml-1.5' : ''}`}>
          <span
            className={`${circle} ${assigneeColor(a)} inline-flex items-center justify-center rounded-full font-bold text-white ring-2 ring-white dark:ring-slate-900`}
          >
            {getInitials(a.name)}
          </span>
        </GlassTooltip>
      ))}
      {rest.length > 0 && (
        <GlassTooltip label={rest.map(assigneeLabel).join(', ')} className="inline-flex -ml-1.5">
          <span
            className={`${circle} inline-flex items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ring-2 ring-white dark:bg-white/20 dark:text-slate-200 dark:ring-slate-900`}
          >
            +{rest.length}
          </span>
        </GlassTooltip>
      )}
    </span>
  );
}
