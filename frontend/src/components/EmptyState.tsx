import type { ReactNode } from 'react';

const STATE_LINE_CLASS = 'py-10 text-center text-xs text-slate-400';

/**
 * Shared empty-state line, extracted from the Reports copies. Renders a
 * paragraph by default; pass as="div" where the original was a div.
 */
export function EmptyState({ children, as = 'p' }: { children: ReactNode; as?: 'div' | 'p' }) {
  if (as === 'div') return <div className={STATE_LINE_CLASS}>{children}</div>;
  return <p className={STATE_LINE_CLASS}>{children}</p>;
}

export default EmptyState;
