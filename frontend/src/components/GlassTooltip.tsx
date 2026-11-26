import type { ReactNode } from 'react';

export interface GlassTooltipProps {
  label: string;
  position?: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
  /** When true the bubble never shows (e.g. while an overlapping menu is open). */
  hide?: boolean;
}

const BUBBLE_BASE =
  'pointer-events-none absolute left-1/2 z-50 whitespace-nowrap tabular-nums rounded-full px-2.5 py-1 ' +
  'text-[11px] font-medium leading-5 backdrop-blur-xl backdrop-saturate-150 border shadow-lg ' +
  'bg-slate-900/80 text-white border-white/20 dark:bg-white/85 dark:text-slate-900 dark:border-white/60 ' +
  'opacity-0 scale-95 transition-all duration-150';

const BUBBLE_SHOW =
  'group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 ' +
  'group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:scale-100';

const ARROW_BASE =
  'absolute left-1/2 -translate-x-1/2 h-1.5 w-1.5 rotate-45 ' +
  'bg-slate-900/80 dark:bg-white/85';

/** CSS-only (group-hover, no JS state) liquid-glass tooltip pill. */
export function GlassTooltip({ label, position = 'top', children, className, hide = false }: GlassTooltipProps): React.JSX.Element {
  const bubblePos =
    position === 'top'
      ? 'bottom-full mb-2 -translate-x-1/2 translate-y-1 group-hover/tooltip:translate-y-0 group-focus-within/tooltip:translate-y-0'
      : 'top-full mt-2 -translate-x-1/2 -translate-y-1 group-hover/tooltip:translate-y-0 group-focus-within/tooltip:translate-y-0';
  const arrowPos =
    position === 'top'
      ? 'top-full -mt-[3px] border-r border-b border-white/20 dark:border-white/60'
      : 'bottom-full -mb-[3px] border-l border-t border-white/20 dark:border-white/60';
  return (
    <span className={`group/tooltip relative ${className ?? 'inline-flex'}`}>
      {children}
      <span role="tooltip" aria-hidden={hide || undefined} className={`${BUBBLE_BASE} ${hide ? 'invisible' : BUBBLE_SHOW} ${bubblePos}`}>
        {label}
        <span aria-hidden="true" className={`${ARROW_BASE} ${arrowPos}`} />
      </span>
    </span>
  );
}

export default GlassTooltip;
