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

function parseISODate(iso: string): Date | null {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(dt: Date): string {
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function isWeekend(dt: Date): boolean {
  const dow = dt.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Date (ISO) of the (k+1)-th working day (Mon–Fri) starting at startISO.
 * startISO counts as day 1 when it is a weekday; weekend starts roll
 * forward to the following Monday (same Mon-roll rule as the backend).
 * k = 0 → first working day on/after startISO.
 */
export function addWorkingDaysISO(startISO: string, k: number): string {
  const parsed = parseISODate(startISO);
  if (!parsed) return startISO;
  const d = new Date(parsed.getTime());
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  let remaining = Math.max(0, Math.floor(k));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) remaining -= 1;
  }
  return toISODate(d);
}

/**
 * Working days (Mon–Fri) in the half-open range (fromISO, toISO].
 * Mirrors a calendar-day diff but skips Sat/Sun; 0 when toISO <= fromISO.
 */
export function workingDaysBetween(fromISO: string, toISO: string): number {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  if (!from || !to) return 0;
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const d = new Date(from.getTime());
  while (d.getTime() < to.getTime()) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) count += 1;
  }
  return count;
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
