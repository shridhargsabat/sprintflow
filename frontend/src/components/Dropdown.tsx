import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  id?: string;
  label?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
}

const DEFAULT_TRIGGER_CLASS = `${GLASS_PILL} inline-flex w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none transition-all duration-200 hover:bg-white/70 dark:hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50`;

export default function Dropdown({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className,
  menuClassName,
  align = 'left',
}: DropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const generatedId = useId();
  const baseId = id ?? generatedId.replace(/:/g, '');
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuPos = (): void => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 144);
    const estH = Math.min(options.length * 40 + 12, 248);
    const below = r.bottom + 8;
    const top = below + estH > window.innerHeight && r.top - 8 - estH > 0 ? r.top - 8 - estH : below;
    setMenuPos({ top, left: align === 'right' ? r.right - width : r.left, width });
  };

  const selected = options.find((o) => o.value === value) ?? null;

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEscapeKey(() => close(true), open);

  const openMenu = (index?: number): void => {
    const selectedIdx = options.findIndex((o) => o.value === value);
    setActiveIndex(index ?? (selectedIdx >= 0 ? selectedIdx : 0));
    updateMenuPos();
    setOpen(true);
  };

  const selectAt = (index: number): void => {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    close(true);
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
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const onListKeyDown = (e: React.KeyboardEvent): void => {
    if (options.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectAt(activeIndex);
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
        if (open) setActiveIndex((i) => (i + 1) % Math.max(options.length, 1));
        else openMenu();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) setActiveIndex((i) => (i - 1 + options.length) % Math.max(options.length, 1));
        else openMenu(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openMenu();
        else selectAt(activeIndex);
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

  return (
    <div ref={rootRef} className="relative inline-block w-full min-w-0">
      {label ? (
        <span
          id={labelId}
          onClick={() => buttonRef.current?.focus()}
          className="mb-1 block cursor-default text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          {label}
        </span>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : placeholder}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400 dark:text-slate-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && menuPos ? createPortal(
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : placeholder}
          aria-activedescendant={options[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          ref={menuRef}
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          className={`lg-dropdown ${GLASS_PANEL} fixed z-[100] max-h-60 overflow-y-auto scroll-slim rounded-2xl p-1.5 outline-none ${menuClassName ?? ''}`}
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No options</li>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <li
                  key={opt.value}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  id={`${baseId}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectAt(i)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none transition-colors duration-100 ${
                    isActive
                      ? 'bg-blue-500/15 text-slate-900 dark:bg-white/15 dark:text-white'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected ? (
                    <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>,
        document.body
      ) : null}
    </div>
  );
}
