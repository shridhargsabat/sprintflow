import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Clock } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface TimePickerProps {
  id?: string;
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  stepMinutes?: number;
  className?: string;
  menuClassName?: string;
}

type Column = 'hour' | 'minute';

const DEFAULT_TRIGGER_CLASS = `${GLASS_PILL} inline-flex w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none transition-all duration-200 hover:bg-white/70 dark:hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50`;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function parseValue(value: string): { hour: string | null; minute: string | null } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return { hour: null, minute: null };
  return { hour: m[1] ?? null, minute: m[2] ?? null };
}

export default function TimePicker({
  id,
  value,
  onChange,
  placeholder = 'Select time',
  stepMinutes = 15,
  className,
  menuClassName,
}: TimePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<Column>('hour');
  const [activeHour, setActiveHour] = useState(0);
  const [activeMinuteIdx, setActiveMinuteIdx] = useState(0);
  const [pendingHour, setPendingHour] = useState<string | null>(null);
  const generatedId = useId();
  const baseId = id ?? generatedId.replace(/:/g, '');
  const listboxId = `${baseId}-timebox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hourRefs = useRef<Array<HTMLLIElement | null>>([]);
  const minuteRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => pad(h)), []);
  const minutes = useMemo(() => {
    const step = stepMinutes > 0 && stepMinutes <= 60 ? Math.floor(stepMinutes) : 15;
    const out: string[] = [];
    for (let m = 0; m < 60; m += step) out.push(pad(m));
    return out;
  }, [stepMinutes]);

  const parsed = parseValue(value);
  const displayHour = pendingHour ?? parsed.hour;

  const updateMenuPos = (): void => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 192);
    const estH = 232;
    const below = r.bottom + 8;
    const top = below + estH > window.innerHeight && r.top - 8 - estH > 0 ? r.top - 8 - estH : below;
    const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
    setMenuPos({ top, left, width });
  };

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    setPendingHour(null);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEscapeKey(() => close(true), open);

  const openMenu = (): void => {
    const p = parseValue(value);
    const hIdx = p.hour !== null ? hours.indexOf(p.hour) : 0;
    let mIdx = p.minute !== null ? minutes.indexOf(p.minute) : 0;
    if (mIdx < 0) mIdx = 0;
    setActiveHour(hIdx >= 0 ? hIdx : 0);
    setActiveMinuteIdx(mIdx);
    setActiveColumn('hour');
    setPendingHour(p.hour);
    updateMenuPos();
    setOpen(true);
  };

  const commit = (hour: string, minute: string): void => {
    onChange(`${hour}:${minute}`);
    close(true);
  };

  const onHourClick = (h: string): void => {
    setPendingHour(h);
    setActiveHour(hours.indexOf(h));
    setActiveColumn('minute');
    minuteRefs.current[activeMinuteIdx]?.scrollIntoView({ block: 'nearest' });
  };

  const onMinuteClick = (mm: string): void => {
    const h = pendingHour ?? parsed.hour ?? hours[activeHour] ?? '00';
    commit(h, mm);
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
    if (!open) return;
    if (activeColumn === 'hour') hourRefs.current[activeHour]?.scrollIntoView({ block: 'nearest' });
    else minuteRefs.current[activeMinuteIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeColumn, activeHour, activeMinuteIdx, open]);

  const onMenuKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (activeColumn === 'hour') setActiveHour((i) => (i + 1) % hours.length);
        else setActiveMinuteIdx((i) => (i + 1) % minutes.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (activeColumn === 'hour') setActiveHour((i) => (i - 1 + hours.length) % hours.length);
        else setActiveMinuteIdx((i) => (i - 1 + minutes.length) % minutes.length);
        break;
      case 'ArrowRight':
        e.preventDefault();
        setActiveColumn('minute');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setActiveColumn('hour');
        break;
      case 'Home':
        e.preventDefault();
        if (activeColumn === 'hour') setActiveHour(0);
        else setActiveMinuteIdx(0);
        break;
      case 'End':
        e.preventDefault();
        if (activeColumn === 'hour') setActiveHour(hours.length - 1);
        else setActiveMinuteIdx(minutes.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeColumn === 'hour') {
          const h = hours[activeHour] ?? '00';
          setPendingHour(h);
          setActiveColumn('minute');
        } else {
          const h = pendingHour ?? hours[activeHour] ?? '00';
          const mm = minutes[activeMinuteIdx] ?? '00';
          commit(h, mm);
        }
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
        else if (activeColumn === 'hour') setActiveHour((i) => (i + 1) % hours.length);
        else setActiveMinuteIdx((i) => (i + 1) % minutes.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openMenu();
        else if (activeColumn === 'hour') setActiveHour((i) => (i - 1 + hours.length) % hours.length);
        else setActiveMinuteIdx((i) => (i - 1 + minutes.length) % minutes.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          openMenu();
        } else {
          const h = pendingHour ?? hours[activeHour] ?? '00';
          const mm = minutes[activeMinuteIdx] ?? '00';
          commit(h, mm);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close(true);
        }
        break;
    }
  };

  const cellClass = (isActive: boolean, isSelected: boolean): string =>
    `cursor-pointer rounded-xl px-3 py-1.5 text-center text-sm outline-none transition-colors duration-100 ${
      isSelected
        ? 'bg-blue-500/20 font-semibold text-slate-900 dark:bg-white/20 dark:text-white'
        : isActive
          ? 'bg-blue-500/15 text-slate-900 dark:bg-white/15 dark:text-white'
          : 'text-slate-700 dark:text-slate-200'
    }`;

  return (
    <div ref={rootRef} className="relative inline-block w-full min-w-0">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={placeholder}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className={`truncate ${value ? '' : 'text-slate-400 dark:text-slate-500'}`}>
            {value || placeholder}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && menuPos
        ? createPortal(
            <div
              id={listboxId}
              role="dialog"
              aria-label={placeholder}
              tabIndex={-1}
              onKeyDown={onMenuKeyDown}
              ref={menuRef}
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
              className={`lg-dropdown ${GLASS_PANEL} fixed z-[100] rounded-2xl p-2 outline-none ${menuClassName ?? ''}`}
            >
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Hour
                  </div>
                  <ul role="listbox" aria-label="Hour" className="max-h-48 overflow-y-auto scroll-slim p-0.5">
                    {hours.map((h, i) => (
                      <li
                        key={h}
                        ref={(el) => {
                          hourRefs.current[i] = el;
                        }}
                        role="option"
                        aria-selected={displayHour === h}
                        onClick={() => onHourClick(h)}
                        onMouseEnter={() => {
                          setActiveHour(i);
                          setActiveColumn('hour');
                        }}
                        className={cellClass(activeColumn === 'hour' && i === activeHour, displayHour === h)}
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Min
                  </div>
                  <ul role="listbox" aria-label="Minute" className="max-h-48 overflow-y-auto scroll-slim p-0.5">
                    {minutes.map((mm, i) => (
                      <li
                        key={mm}
                        ref={(el) => {
                          minuteRefs.current[i] = el;
                        }}
                        role="option"
                        aria-selected={parsed.minute === mm}
                        onClick={() => onMinuteClick(mm)}
                        onMouseEnter={() => {
                          setActiveMinuteIdx(i);
                          setActiveColumn('minute');
                        }}
                        className={cellClass(activeColumn === 'minute' && i === activeMinuteIdx, parsed.minute === mm)}
                      >
                        {mm}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
