import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { formatShortDate } from '../utils/format';

export interface CalendarProps {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
  menuClassName?: string;
}

const DEFAULT_TRIGGER_CLASS = `${GLASS_PILL} inline-flex w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none transition-all duration-200 hover:bg-white/70 dark:hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50`;

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABEL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(y: number, m0: number, d: number): string {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

function parseISO(iso: string): { y: number; m0: number; d: number } | null {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? NaN;
  const m = parts[1] ?? NaN;
  const d = parts[2] ?? NaN;
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m0: m - 1, d };
}

function todayISO(): string {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}

function addDays(iso: string, delta: number): string {
  const p = parseISO(iso);
  if (!p) return todayISO();
  const base = new Date(p.y, p.m0, p.d);
  base.setDate(base.getDate() + delta);
  return toISO(base.getFullYear(), base.getMonth(), base.getDate());
}

function formatLong(iso: string): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return `${formatShortDate(iso)}, ${p.y}`;
}

export default function Calendar({
  id,
  value,
  onChange,
  placeholder = 'Select date',
  min,
  max,
  className,
  menuClassName,
}: CalendarProps): React.JSX.Element {
  const today = todayISO();
  const initialParsed = parseISO(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ y: number; m0: number }>(() => {
    if (initialParsed) return { y: initialParsed.y, m0: initialParsed.m0 };
    const t = parseISO(today);
    return t ? { y: t.y, m0: t.m0 } : { y: 2026, m0: 0 };
  });
  const [focusDay, setFocusDay] = useState<string>(value || today);
  const generatedId = useId();
  const baseId = id ?? generatedId.replace(/:/g, '');
  const gridId = `${baseId}-grid`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuPos = (): void => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 288);
    // Day cells are h-11 below md (44px touch targets) — allow extra height there.
    const estH = window.innerWidth < 768 ? 400 : 340;
    const below = r.bottom + 8;
    const top = below + estH > window.innerHeight && r.top - 8 - estH > 0 ? r.top - 8 - estH : below;
    setMenuPos({ top, left: Math.min(r.left, window.innerWidth - width - 8), width });
  };

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEscapeKey(() => close(true), open);

  const isDisabled = (iso: string): boolean => {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const openMenu = (): void => {
    const parsed = parseISO(value) ?? parseISO(focusDay) ?? parseISO(today);
    if (parsed) {
      setView({ y: parsed.y, m0: parsed.m0 });
      setFocusDay(value || today);
    }
    updateMenuPos();
    setOpen(true);
  };

  const selectDay = (iso: string): void => {
    if (isDisabled(iso)) return;
    onChange(iso);
    close(true);
  };

  const goMonth = (delta: number): void => {
    setView((v) => {
      const m0 = v.m0 + delta;
      const y = v.y + Math.floor(m0 / 12);
      return { y, m0: ((m0 % 12) + 12) % 12 };
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      const inTrigger = rootRef.current ? rootRef.current.contains(t) : false;
      const inMenu = menuRef.current ? menuRef.current.contains(t) : false;
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = (): void => updateMenuPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => {
        dayRefs.current.get(focusDay)?.focus();
      }, 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, focusDay]);

  const moveFocus = (delta: number): void => {
    const next = addDays(focusDay, delta);
    const p = parseISO(next);
    if (p) setView({ y: p.y, m0: p.m0 });
    setFocusDay(next);
    window.setTimeout(() => dayRefs.current.get(next)?.focus(), 0);
  };

  const onGridKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(7);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectDay(focusDay);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openMenu();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openMenu();
        else selectDay(focusDay);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close(true);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  // Monday-start offset: JS getDay() is 0=Sunday.
  const firstDow = new Date(view.y, view.m0, 1).getDay();
  const leadBlanks = (firstDow + 6) % 7;
  const daysInMonth = new Date(view.y, view.m0 + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(view.y, view.m0, d));

  const display = value ? formatLong(value) : placeholder;

  return (
    <div ref={rootRef} className="relative inline-block w-full min-w-0">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={gridId}
        aria-label={value ? `Date: ${display}` : placeholder}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className={`truncate ${value ? '' : 'text-slate-400 dark:text-slate-500'}`}>{display}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              id={gridId}
              role="dialog"
              aria-label="Choose date"
              onKeyDown={onGridKeyDown}
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
              className={`lg-dropdown ${GLASS_PANEL} fixed z-[100] rounded-2xl p-3 outline-none ${menuClassName ?? ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => goMonth(-1)}
                  className="rounded-full p-1.5 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-slate-600 transition-colors hover:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <span aria-live="polite" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {MONTH_LABEL[view.m0]} {view.y}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => goMonth(1)}
                  className="rounded-full p-1.5 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-slate-600 transition-colors hover:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div role="grid" aria-label={`${MONTH_LABEL[view.m0]} ${view.y}`} className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((wd) => (
                  <span
                    key={wd}
                    role="columnheader"
                    className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
                  >
                    {wd}
                  </span>
                ))}
                {cells.map((iso, i) =>
                  iso === null ? (
                    <span key={`blank-${i}`} role="gridcell" className="h-11 md:h-8" />
                  ) : (
                    <button
                      key={iso}
                      ref={(el) => {
                        if (el) dayRefs.current.set(iso, el);
                        else dayRefs.current.delete(iso);
                      }}
                      type="button"
                      role="gridcell"
                      aria-selected={iso === value}
                      aria-label={formatLong(iso)}
                      tabIndex={iso === focusDay ? 0 : -1}
                      disabled={isDisabled(iso)}
                      onClick={() => selectDay(iso)}
                      onFocus={() => {
                        if (iso !== focusDay) {
                          const p = parseISO(iso);
                          if (p) setView({ y: p.y, m0: p.m0 });
                          setFocusDay(iso);
                        }
                      }}
                      className={`h-11 md:h-8 rounded-full text-sm transition-colors duration-100 ${
                        iso === value
                          ? 'bg-blue-600 font-semibold text-white shadow-sm dark:bg-blue-500'
                          : iso === today
                            ? 'font-semibold text-slate-900 ring-2 ring-inset ring-blue-500/70 hover:bg-slate-500/10 dark:text-white dark:ring-blue-400/70 dark:hover:bg-white/10'
                            : 'text-slate-700 hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/10'
                      } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
                    >
                      {Number(iso.slice(8, 10))}
                    </button>
                  )
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
