import type { ReactNode } from 'react';

const ERROR_BANNER_CLASS =
  'px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30';

/**
 * Shared inline error banner, extracted from the Reports copies. Renders a
 * div by default; pass as="p" where the original was a paragraph.
 */
export function ErrorBanner({ children, as = 'div' }: { children: ReactNode; as?: 'div' | 'p' }) {
  if (as === 'p') return <p className={ERROR_BANNER_CLASS}>{children}</p>;
  return <div className={ERROR_BANNER_CLASS}>{children}</div>;
}

export default ErrorBanner;
