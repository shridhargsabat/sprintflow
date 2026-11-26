import type { TaskPriority, TaskStatus } from './types';

export const TODAY_ISO = '2026-11-26';

export const STATUS_COLUMNS: Array<{ id: TaskStatus; label: string; dot: string; badge: string }> = [
  { id: 'backlog', label: 'Backlog', dot: 'bg-slate-400', badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-white/40 dark:border-white/10' },
  { id: 'todo', label: 'To Do', dot: 'bg-sky-500', badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/25' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-blue-500', badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/25' },
  { id: 'in_review', label: 'In Review', dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/25' },
  { id: 'done', label: 'Done', dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/25' }
];

export const PRIORITY_META: Record<TaskPriority, { label: string; weight: number; color: string; pill: string; dot: string }> = {
  critical: { label: 'Critical', weight: 4, color: '#ff3b30', pill: 'bg-rose-500/15 text-rose-700 border-rose-400/30 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-400/30', dot: 'bg-rose-500' },
  high:     { label: 'High',     weight: 3, color: '#ff9500', pill: 'bg-amber-500/15 text-amber-800 border-amber-400/30 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-400/30', dot: 'bg-amber-500' },
  medium:   { label: 'Medium',   weight: 2, color: '#007aff', pill: 'bg-blue-500/15 text-blue-700 border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200 dark:border-blue-400/30', dot: 'bg-blue-500' },
  low:      { label: 'Low',      weight: 1, color: '#8e8e93', pill: 'bg-slate-500/15 text-slate-700 border-slate-400/25 dark:bg-white/10 dark:text-slate-300 dark:border-white/15', dot: 'bg-slate-400' }
};

export const GLASS_PANEL =
  'bg-white/55 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/75 dark:border-white/[0.14] shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_0_rgba(255,255,255,0.85)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.16)]';

export const GLASS_SUBCARD =
  'lg-card-hover lg-press bg-white/45 dark:bg-white/[0.05] backdrop-blur-xl border border-white/65 dark:border-white/[0.10] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.10)] hover:bg-white/70 dark:hover:bg-white/[0.09] hover:border-white/90 dark:hover:border-white/25 transition-all duration-200';

export const GLASS_PILL =
  'lg-press bg-white/55 dark:bg-white/[0.08] backdrop-blur-xl border border-white/75 dark:border-white/[0.14] shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.15)]';
