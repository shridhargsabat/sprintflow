import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, GLASS_SUBCARD } from '../constants';
import { getInitials } from '../utils/format';
import type { Task, TeamMember } from '../types';
import { api } from '../api';
import type { ManagedUser } from '../api';
import type { BulkMemberEntry } from '../hooks/useBoard';
import type { BulkAddMembersResult } from '../hooks/useBoard';
import Dropdown from './Dropdown';
import { ConfirmDialog } from './ConfirmDialog';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { usePermissions } from '../auth/usePermissions';

export interface TeamModalProps {
  team: TeamMember[];
  /** Board tasks already in state; drives per-row counts + delete impact. Optional for backwards compat. */
  tasks?: Task[];
  newMemberName: string;
  newMemberRole: string;
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onUpdateMember: (member: TeamMember) => void | Promise<void>;
  onAddMember: (e: React.FormEvent) => void;
  onAddMemberFromUser: (user: { id: number; name: string }) => void | Promise<void>;
  onRemoveMember: (id: string) => void | Promise<void>;
  onRenameMember: (id: string, patch: Partial<TeamMember>) => void;
  /** Bulk-add handler (useBoard.handleBulkAddMembers). Falls back to direct api calls when absent. */
  onBulkAdd?: (entries: BulkMemberEntry[]) => Promise<BulkAddMembersResult>;
  onClose: () => void;
}

/** Fixed avatar palette — literal tokens so Tailwind keeps them. */
const MEMBER_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-slate-500'
];

const FIELD_INPUT = 'px-2.5 py-1.5 rounded-xl text-xs bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text';

interface EditDraft {
  name: string;
  role: string;
  color: string;
  /** '' = no linked login */
  userId: string;
}

interface BulkReport {
  added: string[];
  errors: Array<{ line: number; text: string; error: string }>;
}

function draftFrom(member: TeamMember): EditDraft {
  return {
    name: member.name,
    role: member.role || '',
    color: MEMBER_COLORS.includes(member.color) ? member.color : MEMBER_COLORS[0],
    userId: member.userId != null ? String(member.userId) : ''
  };
}

export function TeamModal({ team, tasks, newMemberName, newMemberRole, onNameChange, onRoleChange, onUpdateMember, onAddMember, onAddMemberFromUser, onRemoveMember, onBulkAdd, onClose }: TeamModalProps): React.JSX.Element {
  const { can } = usePermissions();
  const canManage = can('team.manage');

  const [query, setQuery] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: '', role: '', color: MEMBER_COLORS[0], userId: '' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<TeamMember | null>(null);
  const [bulkText, setBulkText] = useState<string>('');
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null);
  /** Members added via the api fallback (no onBulkAdd wired) so they show without a refresh. */
  const [localAdded, setLocalAdded] = useState<TeamMember[]>([]);

  // Login-user linking (admin only; hidden when the list is unavailable).
  const [linkUsers, setLinkUsers] = useState<ManagedUser[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.listUsers()
      .then(u => { if (!cancelled) setLinkUsers(u); })
      .catch(() => { if (!cancelled) setLinkUsers(null); });
    return () => { cancelled = true; };
  }, []);

  const handleEscape = (): void => {
    if (editingId !== null) setEditingId(null);
    else onClose();
  };
  useEscapeKey(handleEscape);

  const displayedTeam = useMemo(() => {
    const ids = new Set(team.map(m => m.id));
    return [...team, ...localAdded.filter(m => !ids.has(m.id))];
  }, [team, localAdded]);

  const taskCounts = useMemo(() => {
    if (!tasks) return null;
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.assigneeId) map.set(t.assigneeId, (map.get(t.assigneeId) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return displayedTeam;
    return displayedTeam.filter(m =>
      m.name.toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q)
    );
  }, [displayedTeam, query]);

  const linkOptions = useMemo(
    () => [{ value: '', label: 'No login' }, ...(linkUsers ?? []).map(u => ({ value: String(u.id), label: u.name }))],
    [linkUsers]
  );

  const linkedName = (m: TeamMember): string | null => {
    if (m.userId == null) return null;
    const found = (linkUsers ?? []).find(u => u.id === m.userId);
    return found ? found.name : (m.linkedUser ? m.linkedUser.name : `User #${m.userId}`);
  };

  const startEdit = (m: TeamMember): void => {
    setDraft(draftFrom(m));
    setEditingId(m.id);
    setRowErrors(prev => {
      if (!(m.id in prev)) return prev;
      const next = { ...prev };
      delete next[m.id];
      return next;
    });
  };

  const saveEdit = async (member: TeamMember): Promise<void> => {
    const name = draft.name.trim();
    if (!name) {
      setRowErrors(prev => ({ ...prev, [member.id]: 'Name is required' }));
      return;
    }
    setSavingId(member.id);
    setRowErrors(prev => {
      if (!(member.id in prev)) return prev;
      const next = { ...prev };
      delete next[member.id];
      return next;
    });
    try {
      await onUpdateMember({
        ...member,
        name,
        role: draft.role.trim(),
        color: draft.color,
        userId: draft.userId === '' ? null : Number(draft.userId)
      });
      setEditingId(null);
    } catch (e) {
      setRowErrors(prev => ({ ...prev, [member.id]: e instanceof Error && e.message ? e.message : 'Failed to update member' }));
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await onRemoveMember(id);
    } catch (e) {
      setRowErrors(prev => ({ ...prev, [id]: e instanceof Error && e.message ? e.message : 'Failed to remove member' }));
    }
  };

  const deleteMessage = (m: TeamMember): string => {
    if (!taskCounts) return 'Their tasks will be unassigned.';
    const n = taskCounts.get(m.id) ?? 0;
    return `${n} ${n === 1 ? 'task' : 'tasks'} will be unassigned.`;
  };

  const runBulkAdd = async (): Promise<void> => {
    const entries: BulkMemberEntry[] = [];
    const parseErrors: BulkReport['errors'] = [];
    bulkText.split('\n').forEach((raw, idx) => {
      const lineNo = idx + 1;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const comma = trimmed.indexOf(',');
      const name = (comma === -1 ? trimmed : trimmed.slice(0, comma)).trim();
      const role = comma === -1 ? '' : trimmed.slice(comma + 1).trim();
      if (!name) {
        parseErrors.push({ line: lineNo, text: raw.trim(), error: 'Missing name' });
        return;
      }
      entries.push({ line: lineNo, name, role });
    });
    if (entries.length === 0) {
      setBulkReport({
        added: [],
        errors: parseErrors.length > 0 ? parseErrors : [{ line: 0, text: '', error: 'Enter one "Name[, Role]" per line' }]
      });
      return;
    }
    setBulkBusy(true);
    try {
      if (onBulkAdd) {
        const result = await onBulkAdd(entries);
        setBulkReport({
          added: result.added.map(a => a.name),
          errors: [...parseErrors, ...result.errors.map(e => ({ line: e.line, text: e.name, error: e.error }))]
        });
        if (result.errors.length === 0 && parseErrors.length === 0) setBulkText('');
      } else {
        const added: TeamMember[] = [];
        const errors = [...parseErrors];
        for (const entry of entries) {
          try {
            const created = await api.addMember({ name: entry.name, role: entry.role?.trim() || 'Engineer' });
            added.push(created);
          } catch (e) {
            errors.push({ line: entry.line, text: entry.name, error: e instanceof Error && e.message ? e.message : 'Failed to add member' });
          }
        }
        if (added.length > 0) setLocalAdded(prev => [...prev, ...added]);
        setBulkReport({ added: added.map(a => a.name), errors });
        if (errors.length === 0) setBulkText('');
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const trimming = query.trim();
  const countLabel = trimming
    ? `${filtered.length} of ${displayedTeam.length}`
    : `${displayedTeam.length} ${displayedTeam.length === 1 ? 'member' : 'members'}`;

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-xl rounded-[32px] overflow-hidden flex flex-col max-h-[90vh] ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold">Manage Team Members</h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {canManage ? 'Click the pencil to edit; deletes ask for confirmation' : 'Read-only view'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto scroll-slim">
          {!canManage && (
            <div className="rounded-2xl bg-amber-500/15 border border-amber-400/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
              Ask an admin to edit team members.
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className={`flex-1 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs field-text ${GLASS_PILL}`}>
              <Search className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter by name or role..."
                className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-slate-400"
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{countLabel}</span>
          </div>
          <div className="space-y-2.5 max-h-64 overflow-y-auto scroll-slim pr-1">
            {displayedTeam.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No team members yet{canManage ? ' — add one below' : ''}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No members match &ldquo;{trimming}&rdquo;.
              </div>
            ) : filtered.map(m => {
              const count = taskCounts ? (taskCounts.get(m.id) ?? 0) : null;
              const link = linkedName(m);
              const isEditing = editingId === m.id;
              const isSaving = savingId === m.id;
              return (
                <div key={m.id} className={`p-2 rounded-2xl ${GLASS_SUBCARD}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full ${isEditing ? draft.color : m.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {getInitials(isEditing ? (draft.name || m.name) : m.name)}
                    </span>
                    {isEditing ? (
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                            placeholder="Name"
                            disabled={isSaving}
                            className={`flex-1 min-w-0 font-semibold ${FIELD_INPUT}`}
                          />
                          <input
                            type="text"
                            value={draft.role}
                            onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
                            placeholder="Role"
                            disabled={isSaving}
                            className={`w-24 ${FIELD_INPUT}`}
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {linkUsers !== null && (
                            <div className="w-32 shrink-0">
                              <Dropdown
                                value={draft.userId}
                                onChange={(v) => setDraft(d => ({ ...d, userId: v }))}
                                options={linkOptions}
                                placeholder="No login"
                                className="inline-flex w-full items-center justify-between gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50 field-text"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Avatar color">
                            {MEMBER_COLORS.map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setDraft(d => ({ ...d, color: c }))}
                                disabled={isSaving}
                                aria-label={`Color ${c}`}
                                aria-pressed={draft.color === c}
                                className={`w-5 h-5 rounded-full ${c} transition ${draft.color === c ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-blue-400' : 'opacity-60 hover:opacity-100'}`}
                              />
                            ))}
                          </div>
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-full text-[11px] font-medium hover:bg-white/60 dark:hover:bg-white/10 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEdit(m)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-50"
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{m.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {m.role || 'No role'}{link ? ` · ${link}` : ''}
                          </div>
                        </div>
                        {count !== null && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-white/40 dark:border-white/10">
                            {count} {count === 1 ? 'task' : 'tasks'}
                          </span>
                        )}
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(m)}
                              aria-label={`Edit ${m.name}`}
                              className="p-1.5 rounded-full text-slate-500 hover:text-blue-600 dark:hover:text-blue-300"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {displayedTeam.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setPendingDelete(m)}
                                aria-label={`Delete ${m.name}`}
                                className="p-1.5 rounded-full text-slate-500 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {rowErrors[m.id] && (
                    <div className="mt-1.5 px-1 text-[11px] text-rose-600 dark:text-rose-300">{rowErrors[m.id]}</div>
                  )}
                </div>
              );
            })}
          </div>
          {canManage && (
            <>
              <form onSubmit={onAddMember} className="flex gap-2 pt-3 border-t border-slate-900/10 dark:border-white/10">
                <input type="text" required value={newMemberName} onChange={e => onNameChange(e.target.value)} placeholder="New member name..." className={`flex-1 px-3.5 py-2 rounded-full text-xs field-text ${GLASS_PILL}`} />
                <input type="text" value={newMemberRole} onChange={e => onRoleChange(e.target.value)} placeholder="Role" className={`w-24 px-3 py-2 rounded-full text-xs field-text ${GLASS_PILL}`} />
                <button type="submit" className="px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white">Add</button>
              </form>
              {linkUsers !== null && (() => {
                const unlinked = linkUsers.filter(u => !team.some(m => m.userId === u.id));
                if (unlinked.length === 0) return null;
                return (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 min-w-0">
                      <Dropdown
                        value=""
                        onChange={(v) => {
                          const u = unlinked.find(x => String(x.id) === v);
                          if (u) void onAddMemberFromUser({ id: u.id, name: u.name });
                        }}
                        options={[{ value: '', label: 'Add existing login as member...' }, ...unlinked.map(u => ({ value: String(u.id), label: `${u.name} (${u.email})` }))]}
                        className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-xs field-text ${GLASS_PILL}`}
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 space-y-2">
                <label htmlFor="team-bulk-add" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Bulk add — one &ldquo;Name[, Role]&rdquo; per line
                </label>
                <textarea
                  id="team-bulk-add"
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={3}
                  placeholder={'Ada Lovelace, Engineer\nGrace Hopper, Designer'}
                  disabled={bulkBusy}
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs field-text resize-y ${GLASS_PILL}`}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runBulkAdd()}
                    disabled={bulkBusy}
                    className="px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-50"
                  >
                    {bulkBusy ? 'Adding…' : 'Add all'}
                  </button>
                  {bulkReport && bulkReport.added.length > 0 && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Added {bulkReport.added.length}: {bulkReport.added.join(', ')}
                    </span>
                  )}
                </div>
                {bulkReport && bulkReport.errors.length > 0 && (
                  <ul className="space-y-1 rounded-2xl bg-rose-500/10 border border-rose-400/30 px-3 py-2">
                    {bulkReport.errors.map((e, i) => (
                      <li key={`${e.line}-${i}`} className="text-[11px] text-rose-700 dark:text-rose-200">
                        {e.line > 0 ? `Line ${e.line}` : 'Bulk add'}: {e.text ? `“${e.text}” — ` : ''}{e.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete member?'}
        message={pendingDelete ? deleteMessage(pendingDelete) : ''}
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
