import { useEffect, useState } from 'react';
import { GLASS_PILL } from '../constants';
import { api } from '../api';
import type { SprintConfig, SprintReport } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { SprintReportBody } from './SprintReportBody';
import { Modal } from './Modal';
import { EyebrowBadge } from './EyebrowBadge';
import { ErrorBanner } from './ErrorBanner';
import { LoadingState } from './LoadingState';

interface SprintReportModalProps {
  sprintId: string;
  sprints: SprintConfig[];
  onClose: () => void;
}

export function SprintReportModal({ sprintId, sprints, onClose }: SprintReportModalProps) {
  useEscapeKey(onClose);
  const [report, setReport] = useState<SprintReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError(null);
    api.getSprintReport(sprintId).then(
      r => { if (!cancelled) setReport(r); },
      (e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load report'); }
    );
    return () => { cancelled = true; };
  }, [sprintId]);

  return (
    <Modal
      onClose={onClose}
      zClass="z-[70]"
      label={report ? `Sprint report for ${report.sprint.name}` : 'Sprint report'}
      closeLabel="Close report"
      title={
        <div className="flex items-center gap-2 min-w-0">
          <EyebrowBadge>REPORT</EyebrowBadge>
          <h3 className="text-base font-semibold truncate">{report ? report.sprint.name : 'Sprint report'}</h3>
        </div>
      }
      footer={
        <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 ${GLASS_PILL}`}>
            Close
          </button>
        </div>
      }
    >
      {error !== null && (
        <ErrorBanner>{error}</ErrorBanner>
      )}
      {report === null && error === null && (
        <LoadingState as="div">Loading report…</LoadingState>
      )}
      {report !== null && <SprintReportBody report={report} sprints={sprints} />}
    </Modal>
  );
}
