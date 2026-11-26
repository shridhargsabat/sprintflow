import type { TaskStatus } from '../types';
import { TODAY_ISO } from '../constants';

export function getInitials(name: string): string {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || '?').slice(0, 2).toUpperCase();
}

export function formatShortDate(iso: string): string {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getDueMeta(iso: string, status: TaskStatus): { text: string; cls: string } {
  if (status === 'done') return { text: formatShortDate(iso), cls: 'text-emerald-600 dark:text-emerald-400' };
  if (!iso) return { text: 'TBD', cls: 'text-slate-400' };
  const today = new Date(TODAY_ISO + 'T00:00:00');
  const due = new Date(iso + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { text: `${formatShortDate(iso)} · Overdue`, cls: 'text-rose-600 dark:text-rose-400 font-semibold' };
  if (diffDays === 0) return { text: 'Today', cls: 'text-rose-600 dark:text-rose-400 font-semibold' };
  if (diffDays <= 2) return { text: `${formatShortDate(iso)} (${diffDays}d)`, cls: 'text-amber-600 dark:text-amber-300 font-semibold' };
  return { text: formatShortDate(iso), cls: 'text-slate-600 dark:text-slate-400' };
}
