import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface DropdownOption {
  value: string;
  label: string;
  /** Section label; consecutive options sharing a group render under one sticky header. */
  group?: string;
}

interface DropdownBaseProps {
  id?: string;
  label?: string;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
  /** Show a filter input on top of the menu (filters by label, case-insensitive). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /**
   * Inline-create: when set (and searchable), a `Create "query"` row appears
   * when the query has no exact label match. Must create + return the new
   * option (also appending it to the parent's options); Dropdown selects it.
   * Omit to disable (e.g. for non-admins).
   */
  onCreateNew?: (query: string) => Promise<DropdownOption | null>;
  createLabel?: (query: string) => string;
}

export interface DropdownSingleProps extends DropdownBaseProps {
  multi?: false;
  value: string;
  onChange: (value: string) => void;
}

export interface DropdownMultiProps extends DropdownBaseProps {
  multi: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type DropdownProps = DropdownSingleProps | DropdownMultiProps;

const DEFAULT_TRIGGER_CLASS = `${GLASS_PILL} inline-flex w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none transition-all duration-200 hover:bg-white/70 dark:hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50`;

export default function Dropdown(props: DropdownProps): React.JSX.Element {
  const {
    id,
    label,
    options,
    placeholder = 'Select…',
    className,
    menuClassName,
    align = 'left',
    searchable = false,
    searchPlaceholder = 'Search…',
    onCreateNew,
    createLabel = (q: string): string => `Create "${q}"`,
  } = props;
  const multi = props.multi === true;
  const value: string | string[] = props.value;
  const onChange = props.onChange as (v: string | string[]) => void;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    multi ? 0 : Math.max(0, options.findIndex((o) => o.value === (value as string)))
  );
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const generatedId = useId();
  const baseId = id ?? generatedId.replace(/:/g, '');
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const menuRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; listMaxH: number | null } | null>(null);

  const visibleOptions = useMemo(() => {
    if (!searchable || query.trim() === '') return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchable, query]);

  const canCreate = useMemo(() => {
    if (!searchable || !onCreateNew) return false;
    const q = query.trim();
    if (q === '') return false;
    return !options.some((o) => o.label.toLowerCase() === q.toLowerCase());
  }, [searchable, onCreateNew, options, query]);

  const handleCreateNew = async (): Promise<void> => {
    if (!onCreateNew || creating) return;
    const q = query.trim();
    if (q === '') return;
    setCreating(true);
    try {
      const created = await onCreateNew(q);
      if (created) {
        if (multi) {
          const cur = value as string[];
          if (!cur.includes(created.value)) onChange([...cur, created.value]);
        } else {
          onChange(created.value);
          close(true);
        }
        setQuery('');
      }
    } finally {
      setCreating(false);
    }
  };

  const updateMenuPos = (): void => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 144);
    // Viewport-aware estimate: filtered (visible) rows + sticky group headers,
    // capped by the responsive list max-h, plus the search block when
    // searchable and a footer row when a create row or multi Done footer shows.
    const isSmall = window.innerWidth < 768;
    const rowH = isSmall ? 44 : 36;
    const groupCount = new Set(visibleOptions.map((o) => o.group).filter(Boolean)).size;
    const listH = visibleOptions.length === 0 ? 40 : visibleOptions.length * rowH + groupCount * 24;
    // Must mirror the responsive ul caps below (38vh small, max-h-56/60 desktop).
    const listCapPx = isSmall ? window.innerHeight * 0.38 : searchable ? 224 : 240;
    const chrome = searchable ? 64 + (multi || canCreate ? 52 : 0) : 12;
    const estH = Math.min(listH, listCapPx) + chrome;
    const below = r.bottom + 8;
    const spaceBelow = window.innerHeight - below - 8;
    const spaceAbove = r.top - 8;
    // Small screens reserve one extra row so the next field (e.g. Due Date
    // below Assignee) stays reachable instead of being covered by the menu.
    const belowNeed = estH + (isSmall ? 56 : 0);
    const minAboveNeed = chrome + 120;
    let top: number;
    let listMaxH: number | null = null;
    if (belowNeed <= spaceBelow) {
      top = below;
    } else if (spaceAbove >= minAboveNeed) {
      // Flip above the trigger; shrink the list to fit when room is tight.
      if (spaceAbove < estH) listMaxH = Math.max(96, spaceAbove - chrome);
      top = r.top - 8 - (listMaxH != null ? listMaxH + chrome : estH);
    } else {
      // Neither side fits: stay below (roomier) but cap the list to the viewport.
      if (spaceBelow > chrome + 96) listMaxH = spaceBelow - chrome;
      top = below;
    }
    setMenuPos({ top, left: align === 'right' ? r.right - width : r.left, width, listMaxH });
  };

  const selectedValues: string[] = multi ? (value as string[]) : [value as string];
  const selected = multi ? null : (options.find((o) => o.value === value) ?? null);
  const multiCount = multi ? selectedValues.length : 0;
  const multiTitles = multi
    ? selectedValues.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ')
    : undefined;

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEscapeKey(() => close(true), open);

  const openMenu = (index?: number): void => {
    setQuery('');
    const selectedIdx = options.findIndex((o) => selectedValues.includes(o.value));
    setActiveIndex(index ?? (selectedIdx >= 0 ? selectedIdx : 0));
    updateMenuPos();
    setOpen(true);
  };

  const selectAt = (index: number): void => {
    const opt = visibleOptions[index];
    if (!opt) return;
    if (multi) {
      const cur = value as string[];
      onChange(cur.includes(opt.value) ? cur.filter((v) => v !== opt.value) : [...cur, opt.value]);
    } else {
      onChange(opt.value);
      close(true);
    }
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

  useEffect(() => {
    if (open) setActiveIndex((i) => (i >= visibleOptions.length ? 0 : i));
  }, [visibleOptions.length, open]);

  // Keep the flip-above decision accurate as the filter narrows the menu.
  useEffect(() => {
    if (open) updateMenuPos();
  }, [visibleOptions.length, canCreate, open]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const onListKeyDown = (e: React.KeyboardEvent): void => {
    if (visibleOptions.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % visibleOptions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + visibleOptions.length) % visibleOptions.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(visibleOptions.length - 1);
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
        if (open) setActiveIndex((i) => (i + 1) % Math.max(visibleOptions.length, 1));
        else openMenu();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) setActiveIndex((i) => (i - 1 + visibleOptions.length) % Math.max(visibleOptions.length, 1));
        else openMenu(visibleOptions.length - 1);
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

  const onSearchKeyDown = (e: React.KeyboardEvent): void => {
    if (visibleOptions.length === 0 && !(e.key === 'Enter' && canCreate) && e.key !== 'Escape') return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(visibleOptions.length, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + visibleOptions.length) % Math.max(visibleOptions.length, 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (visibleOptions.length === 0 && canCreate) void handleCreateNew();
        else selectAt(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
    }
  };

  const renderMenuItems = (): React.ReactNode => {
    if (options.length === 0) {
      return <li className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No options</li>;
    }
    if (visibleOptions.length === 0) {
      return <li className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No matches</li>;
    }
    const items: React.ReactNode[] = [];
    let lastGroup: string | undefined;
    visibleOptions.forEach((opt, i) => {
      if (opt.group !== lastGroup) {
        lastGroup = opt.group;
        if (opt.group) {
          items.push(
            <li
              key={`group-${i}-${opt.group}`}
              role="presentation"
              aria-hidden="true"
              className="sticky top-0 z-10 rounded-lg bg-white/90 px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur-xl dark:bg-slate-900/90 dark:text-slate-400"
            >
              {opt.group}
            </li>
          );
        }
      }
      const isSelected = selectedValues.includes(opt.value);
      const isActive = i === activeIndex;
      items.push(
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
          className={`flex min-h-[44px] md:min-h-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none transition-colors duration-100 ${
            isActive
              ? 'bg-blue-500/15 text-slate-900 dark:bg-white/15 dark:text-white'
              : 'text-slate-700 dark:text-slate-200'
          }`}
        >
          {multi ? (
            <>
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-slate-300 text-transparent dark:border-white/30'
                }`}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="flex-1 truncate">{opt.label}</span>
            </>
          ) : (
            <>
              <span className="truncate">{opt.label}</span>
              {isSelected ? (
                <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
              ) : null}
            </>
          )}
        </li>
      );
    });
    return items;
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
        title={multi && multiCount > 0 ? multiTitles : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        {multi ? (
          <span className={`truncate ${multiCount > 0 ? '' : 'text-slate-400 dark:text-slate-500'}`}>
            {multiCount > 0 ? `${multiCount} selected` : placeholder}
          </span>
        ) : (
          <span className={`truncate ${selected ? '' : 'text-slate-400 dark:text-slate-500'}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && menuPos ? createPortal(
        searchable ? (
          <div
            ref={(el) => {
              menuRef.current = el;
            }}
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            className={`lg-dropdown ${GLASS_PANEL} fixed z-[100] rounded-2xl p-1.5 outline-none ${menuClassName ?? ''}`}
          >
            <div className="relative p-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                onClick={(e) => e.stopPropagation()}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-xl bg-slate-900/[0.05] py-1.5 pl-8 pr-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:bg-slate-900/[0.08] dark:bg-black/25 dark:text-slate-100 dark:focus:bg-black/40"
              />
            </div>
            <ul
              id={listboxId}
              role="listbox"
              aria-labelledby={label ? labelId : undefined}
              aria-label={label ? undefined : placeholder}
              aria-activedescendant={visibleOptions[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined}
              tabIndex={-1}
              onKeyDown={onListKeyDown}
              style={menuPos.listMaxH != null ? { maxHeight: menuPos.listMaxH } : undefined}
              className="max-h-[38vh] md:max-h-56 overflow-y-auto scroll-slim outline-none"
            >
              {renderMenuItems()}
            </ul>
            {canCreate && (
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateNew()}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-blue-600 outline-none transition-colors hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-60 dark:text-blue-300"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{creating ? 'Creating…' : createLabel(query.trim())}</span>
              </button>
            )}
            {multi && (
              <button
                type="button"
                onClick={() => close(true)}
                className="mt-1 flex min-h-[44px] md:min-h-0 w-full items-center justify-center gap-2 rounded-xl bg-slate-900/[0.06] dark:bg-white/10 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none transition-colors hover:bg-slate-900/10 dark:hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                Done
              </button>
            )}
          </div>
        ) : (
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : placeholder}
            aria-activedescendant={visibleOptions[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            ref={(el) => {
              menuRef.current = el;
            }}
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width, ...(menuPos.listMaxH != null ? { maxHeight: menuPos.listMaxH } : {}) }}
            className={`lg-dropdown ${GLASS_PANEL} fixed z-[100] max-h-[38vh] md:max-h-60 overflow-y-auto scroll-slim rounded-2xl p-1.5 outline-none ${menuClassName ?? ''}`}
          >
            {renderMenuItems()}
          </ul>
        ),
        document.body
      ) : null}
    </div>
  );
}
