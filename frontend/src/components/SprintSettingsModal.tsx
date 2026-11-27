import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import Calendar from './Calendar';
import Dropdown from './Dropdown';
import ConfirmDialog from './ConfirmDialog';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { formatShortDate } from '../utils/format';
import { suggestNextSprintName } from '../utils/sprint';
import type { SprintConfig, SprintPatch, SprintStatus, Task } from '../types';
import type { CreateSprintPayload } from '../api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { usePermissions } from '../auth/usePermissions';

interface SprintSettingsModalProps {
  sprints: SprintConfig[];
  tasks: Task[];
  onClose: () => void;
  onSave: (id: string, patch: SprintPatch) => void;
  onCreate: (payload: CreateSprintPayload) => void;
  onActivate: (id: string) => void;
  onCloseSprint: (id: string, rolloverTo?: string) => void;
  onRolloverSprint: (id: string, targetId: string) => void;
  onNothingToMove: () => void;
}

const LENGTH_PRESETS: Array<{ label: string; days: number }> = [
  { label: '1 week · 5d', days: 5 },
  { label: '2 weeks · 10d', days: 10 },
  { label: '3 weeks · 15d', days: 15 },
  { label: '4 weeks · 20d', days: 20 }
];

const STATUS_BADGE: Record<SprintStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30',
  planned: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-400/30',
  closed: 'bg-slate-900/10 dark:bg-white/10 text-slate-500 dark:text-slate-400 border border-slate-400/20'
};

const STATUS_LABEL: Record<SprintStatus, string> = {
  active: 'Active',
  planned: 'Planned',
  closed: 'Closed'
};

const CALENDAR_FIELD = 'inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text';
const TEXT_FIELD = 'w-full px-3 py-2 rounded-2xl text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text placeholder-slate-500 dark:placeholder-slate-400';

function statusOf(sprint: SprintConfig): SprintStatus {
  return sprint.status ?? 'planned';
}

function SprintRow({
  sprint,
  canManage,
  unfinishedCount,
  hasRolloverTarget,
  onSave,
  onActivate,
  onRequestClose,
  onRequestRollover
}: {
  sprint: SprintConfig;
  canManage: boolean;
  unfinishedCount: number;
  hasRolloverTarget: boolean;
  onSave: (id: string, patch: SprintPatch) => void;
  onActivate: (id: string) => void;
  onRequestClose: (sprint: SprintConfig) => void;
  onRequestRollover: (sprint: SprintConfig) => void;
}) {
  const [name, setName] = useState<string>(sprint.name);
  const [startDate, setStartDate] = useState<string>(sprint.startDate);
  const [lengthDays, setLengthDays] = useState<number>(sprint.lengthDays);
  const status = statusOf(sprint);

  const dirty = name.trim() !== sprint.name || startDate !== sprint.startDate || lengthDays !== sprint.lengthDays;

  return (
    <div className="rounded-2xl bg-white/60 dark:bg-white/[0.06] border border-white/80 dark:border-white/15 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{sprint.name}</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Currently {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)} · {sprint.lengthDays} working days
          </p>
        </div>
        <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${STATUS_BADGE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      {status !== 'closed' && (
        <>
          <div>
            <label className="block text-xs font-semibold mb-1">Sprint Name</label>
            <input
              type="text"
              value={name}
              maxLength={60}
              onChange={e => setName(e.target.value)}
              placeholder="Sprint name"
              className="w-full rounded-2xl px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Start Date</label>
            <Calendar
              value={startDate}
              onChange={setStartDate}
              className={CALENDAR_FIELD}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Sprint Length (working days, Mon–Fri)</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {LENGTH_PRESETS.map(p => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setLengthDays(p.days)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                    lengthDays === p.days
                      ? 'bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-blue-500/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {canManage && status !== 'closed' && (
      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
              {status !== 'active' && (
                <button
                  type="button"
                  onClick={() => onActivate(sprint.id)}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/25"
                >
                  Activate
                </button>
              )}
              <button
                type="button"
                onClick={() => onRequestClose(sprint)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 border border-slate-400/25"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!hasRolloverTarget}
                onClick={() => onRequestRollover(sprint)}
                title={`${unfinishedCount} unfinished ${unfinishedCount === 1 ? 'task' : 'tasks'}`}
                className="px-4 py-2 rounded-full text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 border border-blue-400/25 min-h-[44px] md:min-h-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Move unfinished to…
              </button>
        </div>
          <button
            type="button"
            disabled={!dirty || !startDate}
            onClick={() => onSave(sprint.id, { name: name.trim(), startDate, lengthDays })}
            className="px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
      </div>
      )}
    </div>
  );
}

function CreateSprintForm({ sprints, onCreate }: { sprints: SprintConfig[]; onCreate: (payload: CreateSprintPayload) => void }) {
  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [lengthDays, setLengthDays] = useState<number>(14);
  // Suggestion only: prefill from the live sprint list, but any keystroke
  // marks the field user-edited and stops syncing so edits are never forced.
  const [edited, setEdited] = useState<boolean>(false);

  const suggestion = useMemo(() => suggestNextSprintName(sprints), [sprints]);

  useEffect(() => {
    if (open && !edited) setName(suggestion);
  }, [open, suggestion, edited]);

  const toggleOpen = (): void => {
    if (!open) {
      setEdited(false);
      setName(suggestion);
    }
    setOpen(!open);
  };

  const valid = name.trim() !== '' && startDate !== '';

  const handleCreate = (): void => {
    if (!valid) return;
    onCreate({ name: name.trim(), startDate, lengthDays });
    setName('');
    setStartDate('');
    setLengthDays(14);
    setEdited(false);
    setOpen(false);
  };

  return (
    <div className="rounded-2xl bg-blue-500/[0.07] dark:bg-blue-500/10 border border-blue-400/25 p-4">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
      >
        <span className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Sprint
        </span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setEdited(true); }}
              placeholder="Sprint name"
              className={TEXT_FIELD}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Start Date</label>
            <Calendar value={startDate} onChange={setStartDate} className={CALENDAR_FIELD} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Sprint Length</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {LENGTH_PRESETS.map(p => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setLengthDays(p.days)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                    lengthDays === p.days
                      ? 'bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-blue-500/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={!valid}
              onClick={handleCreate}
              className="px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Sprint
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SprintSettingsModal({ sprints, tasks, onClose, onSave, onCreate, onActivate, onCloseSprint, onRolloverSprint, onNothingToMove }: SprintSettingsModalProps) {
  useEscapeKey(onClose);
  const { can } = usePermissions();
  const canManage = can('sprints.manage');

  const [pendingClose, setPendingClose] = useState<SprintConfig | null>(null);
  const [rollover, setRollover] = useState<string>('Backlog');
  const [pendingRollover, setPendingRollover] = useState<SprintConfig | null>(null);
  const [rolloverTarget, setRolloverTarget] = useState<string>('');

  const openSprints = sprints.filter(s => statusOf(s) !== 'closed');
  const rolloverOptions =
    pendingClose === null
      ? []
      : [
          ...openSprints
            .filter(s => s.id !== pendingClose.id)
            .map(s => ({ value: s.id, label: `${s.name} (${STATUS_LABEL[statusOf(s)]})` })),
          { value: 'Backlog', label: 'Move to Backlog' }
        ];

  const handleRequestClose = (sprint: SprintConfig): void => {
    const firstOpen = openSprints.find(s => s.id !== sprint.id);
    setRollover(firstOpen ? firstOpen.id : 'Backlog');
    setPendingClose(sprint);
  };

  const handleConfirmClose = (): void => {
    if (!pendingClose) return;
    onCloseSprint(pendingClose.id, rollover === 'Backlog' ? undefined : rollover);
    setPendingClose(null);
  };

  // Unfinished (status != 'done') tasks currently in each sprint, mirroring
  // the backend rollover filter (tasks store the stable sprint id).
  const unfinishedCountFor = (sprintId: string): number =>
    tasks.filter(t => t.sprint === sprintId && t.status !== 'done').length;

  const rolloverTargetsFor = (sprintId: string): SprintConfig[] =>
    openSprints.filter(s => s.id !== sprintId);

  // Default target: the next sprint in list order after the source, else the
  // first other open sprint ('' when no valid target exists).
  const defaultTargetFor = (sprintId: string): string => {
    const idx = sprints.findIndex(s => s.id === sprintId);
    const after = idx >= 0 ? sprints.slice(idx + 1) : [];
    const next = after.find(s => s.id !== sprintId && statusOf(s) !== 'closed');
    if (next) return next.id;
    return rolloverTargetsFor(sprintId)[0]?.id ?? '';
  };

  const rolloverTargetOptions =
    pendingRollover === null
      ? []
      : rolloverTargetsFor(pendingRollover.id).map(s => ({
          value: s.id,
          label: `${s.name} (${STATUS_LABEL[statusOf(s)]})`
        }));

  const pendingRolloverTargetName =
    sprints.find(s => s.id === rolloverTarget)?.name ?? rolloverTarget;
  const pendingRolloverCount =
    pendingRollover === null ? 0 : unfinishedCountFor(pendingRollover.id);

  const handleRequestRollover = (sprint: SprintConfig): void => {
    if (unfinishedCountFor(sprint.id) === 0) {
      onNothingToMove();
      return;
    }
    const def = defaultTargetFor(sprint.id);
    if (!def) return;
    setRolloverTarget(def);
    setPendingRollover(sprint);
  };

  const handleConfirmRollover = (): void => {
    if (!pendingRollover || !rolloverTarget) return;
    onRolloverSprint(pendingRollover.id, rolloverTarget);
    setPendingRollover(null);
  };

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">SPRINTS</span>
            <h3 className="text-base font-semibold">Sprint Settings</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scroll-slim">
          {!canManage && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              Sprint management requires admin or lead access. You have read-only access.
            </div>
          )}
          {canManage && <CreateSprintForm sprints={sprints} onCreate={onCreate} />}
          {sprints.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">No sprints configured yet.</div>
          ) : (
            sprints.map(s => (
              <SprintRow
                key={s.id}
                sprint={s}
                canManage={canManage}
                unfinishedCount={unfinishedCountFor(s.id)}
                hasRolloverTarget={rolloverTargetsFor(s.id).length > 0}
                onSave={onSave}
                onActivate={onActivate}
                onRequestClose={handleRequestClose}
                onRequestRollover={handleRequestRollover}
              />
            ))
          )}
          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold ${GLASS_PILL}`}>
              Close
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRollover !== null}
        title={pendingRollover ? `Move unfinished to ${pendingRolloverTargetName}?` : 'Move unfinished?'}
        message={
          pendingRollover
            ? `Move ${pendingRolloverCount} unfinished ${pendingRolloverCount === 1 ? 'task' : 'tasks'} from ${pendingRollover.name} to ${pendingRolloverTargetName}?`
            : ''
        }
        confirmLabel="Move tasks"
        onConfirm={handleConfirmRollover}
        onCancel={() => setPendingRollover(null)}
      >
        <div>
          <label className="block text-xs font-semibold mb-1">Target sprint</label>
          <Dropdown
            value={rolloverTarget}
            onChange={setRolloverTarget}
            options={rolloverTargetOptions}
            className="inline-flex w-full min-h-[44px] md:min-h-0 items-center justify-between gap-2 rounded-2xl px-3 py-2 text-base md:text-xs bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] outline-none field-text"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingClose !== null}
        title={pendingClose ? `Close ${pendingClose.name}?` : 'Close sprint?'}
        message={
          pendingClose
            ? `Closing ${pendingClose.name} moves its open tasks to the selected destination. This cannot be undone.`
            : ''
        }
        confirmLabel="Close Sprint"
        danger
        onConfirm={handleConfirmClose}
        onCancel={() => setPendingClose(null)}
      >
        <div>
          <label className="block text-xs font-semibold mb-1">Move open tasks to</label>
          <Dropdown
            value={rollover}
            onChange={setRollover}
            options={rolloverOptions}
            className="inline-flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] outline-none field-text"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
