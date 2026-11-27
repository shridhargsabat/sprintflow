import type { ReactNode } from 'react';

type EyebrowTone = 'blue' | 'violet';

const TONE: Record<EyebrowTone, string> = {
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-400/30'
};

/**
 * Shared modal-header eyebrow pill, extracted from the SprintReportModal
 * REPORT badge. Pass shrink={false} where the original lacked shrink-0.
 */
export function EyebrowBadge({
  children,
  tone = 'blue',
  shrink = true
}: {
  children: ReactNode;
  tone?: EyebrowTone;
  shrink?: boolean;
}) {
  return (
    <span
      className={`${shrink ? 'shrink-0 ' : ''}px-2.5 py-0.5 rounded-full text-[11px] font-bold ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export default EyebrowBadge;
