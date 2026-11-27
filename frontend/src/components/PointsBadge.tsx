import type { ReactNode } from 'react';

/** Shared points pill, extracted from the SprintReportBody TaskRow copy. */
export function PointsBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">
      {children}
    </span>
  );
}

export default PointsBadge;
