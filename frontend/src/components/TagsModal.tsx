import { useEffect, useState } from 'react';
import type React from 'react';
import { Pencil, Tags, Trash2, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_SUBCARD } from '../constants';
import { api, ApiError } from '../api';
import type { Tag, UpdateTagPayload } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { usePermissions } from '../auth/usePermissions';

const FIELD =
  'px-3 py-2 rounded-full text-xs field-text bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50';

/** Shared tag color palette (hex so dots render via inline style). */
export const TAG_COLORS = [
  '#0a84ff',
  '#8e5cf6',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#f97316',
  '#64748b'
];

function dotColor(color: string): string {
  return color && color.trim() !== '' ? color : TAG_COLORS[0];
}

function ColorSwatches({
  value,
  onChange,
  disabled,
  label
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  label: string;
}): React.JSX.Element {
  // L6: when the stored color is outside the palette (seed/foreign value),
  // show it as an extra "current" swatch instead of silently resetting.
  const swatches = value !== '' && !TAG_COLORS.includes(value) ? [value, ...TAG_COLORS] : TAG_COLORS;
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={label}>
      {swatches.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          disabled={disabled}
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          style={{ backgroundColor: c }}
          className={`w-5 h-5 rounded-full transition disabled:opacity-50 ${value === c ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-blue-400' : 'opacity-60 hover:opacity-100'}`}
        />
      ))}
    </div>
  );
}

/** Tag master management. Self-contained: fetches + mutates via api. Non-admins get a read-only view. */
export function TagsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEscapeKey(onClose);
  const { can } = usePermissions();
  const canManage = can('team.manage');

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eColor, setEColor] = useState<string>(TAG_COLORS[0]);
  const [eSaving, setESaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listTags()
      .then(t => { if (!cancelled) setTags(t); })
      .catch(e => {
        if (!cancelled) {
          setLoadFailed(true);
          setError(e instanceof Error ? e.message : 'Failed to load tags');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    setSaving(true);
    setError(null);
    api.createTag({ name: trimmed, color })
      .then(t => {
        setTags(prev => [...prev, t]);
        setName('');
        setColor(TAG_COLORS[0]);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to create tag'))
      .finally(() => setSaving(false));
  };

  const startEdit = (t: Tag): void => {
    setEditingId(t.id);
    setEName(t.name);
    // L6: preserve the stored color even when it is outside the palette —
    // ColorSwatches renders it as an extra "current" swatch.
    setEColor(t.color && t.color.trim() !== '' ? t.color : TAG_COLORS[0]);
    setError(null);
  };

  const handleSaveEdit = (t: Tag): void => {
    const patch: UpdateTagPayload = {};
    if (eName.trim() !== '' && eName.trim() !== t.name) patch.name = eName.trim();
    if (eColor !== t.color) patch.color = eColor;
    if (Object.keys(patch).length === 0) { setEditingId(null); return; }
    setESaving(true);
    setError(null);
    api.updateTag(t.id, patch)
      .then(updated => {
        setTags(prev => prev.map(x => (x.id === t.id ? updated : x)));
        setEditingId(null);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to update tag'))
      .finally(() => setESaving(false));
  };

  const handleDelete = (t: Tag): void => {
    setError(null);
    api.deleteTag(t.id)
      .then(() => setTags(prev => prev.filter(x => x.id !== t.id)))
      .catch(err => {
        // L5: the 409 carries {tasks:N} — name the tag and its live usage
        // instead of the generic parsed message.
        if (err instanceof ApiError && err.status === 409) {
          const d = err.data as { tasks?: unknown } | null;
          const n = typeof d?.tasks === 'number' ? d.tasks : (t.taskCount ?? 0);
          setError(`Cannot delete "${t.name}" — ${n} ${n === 1 ? 'task still uses' : 'tasks still use'} this tag. Retag those tasks first.`);
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to delete tag');
      });
  };

  const confirmDelete = (): void => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target) handleDelete(target);
  };

  const deleteMessage = (t: Tag): string => {
    const n = t.taskCount ?? 0;
    const base = `Delete tag "${t.name}"?`;
    if (n === 0) return `${base} No tasks use this tag.`;
    return `${base} ${n} ${n === 1 ? 'task uses' : 'tasks use'} this tag — tags in use cannot be deleted until those tasks are retagged.`;
  };

  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? tags
    : tags.filter(t => t.name.toLowerCase().includes(q));

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-md rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Tags className="w-4 h-4 text-blue-500" /> Manage Tags
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {canManage ? 'Master tag list used by every task' : 'Read-only view'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!canManage && (
            <div className="rounded-2xl bg-amber-500/15 border border-amber-400/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
              Ask an admin to edit tags.
            </div>
          )}
          {error && (
            <div className="px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tags…"
              aria-label="Search tags"
              className={`flex-1 min-w-0 ${FIELD}`}
            />
            <span className="text-[11px] text-slate-500 shrink-0" aria-live="polite">
              {filtered.length} of {tags.length}
            </span>
          </div>
          <div className="space-y-2.5 max-h-56 overflow-y-auto scroll-slim pr-1">
            {loading && <div className="text-xs text-slate-500 py-4 text-center">Loading tags…</div>}
            {!loading && tags.length === 0 && !loadFailed && (
              <div className="text-xs text-slate-500 py-4 text-center">No tags yet{canManage ? ' — add one below' : ''}</div>
            )}
            {!loading && tags.length === 0 && loadFailed && (
              <div className="text-xs text-slate-500 py-4 text-center">Cannot load tags — check your connection</div>
            )}
            {!loading && tags.length > 0 && filtered.length === 0 && (
              <div className="text-xs text-slate-500 py-4 text-center">No matching tags</div>
            )}
            {filtered.map(t => {
              if (editingId === t.id) {
                return (
                  <div key={t.id} className={`p-2.5 rounded-2xl space-y-2 ${GLASS_SUBCARD}`}>
                    <input
                      type="text"
                      value={eName}
                      onChange={e => setEName(e.target.value)}
                      placeholder="Tag name"
                      disabled={eSaving}
                      className={`w-full font-semibold ${FIELD}`}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <ColorSwatches value={eColor} onChange={setEColor} disabled={eSaving} label="Tag color" />
                      <div className="flex-1" />
                      <button type="button" onClick={() => setEditingId(null)} disabled={eSaving} className="px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 disabled:opacity-50">Cancel</button>
                      <button type="button" onClick={() => handleSaveEdit(t)} disabled={eSaving} className="px-4 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-60">
                        {eSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={t.id} className={`flex items-center gap-2.5 p-2 rounded-2xl ${GLASS_SUBCARD}`}>
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/60 dark:border-white/20"
                    style={{ backgroundColor: dotColor(t.color) }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0 text-xs font-semibold truncate">{t.name}</span>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-white/40 dark:border-white/10">
                    {t.taskCount ?? 0} {(t.taskCount ?? 0) === 1 ? 'task' : 'tasks'}
                  </span>
                  {canManage && (
                    <>
                      <button type="button" onClick={() => startEdit(t)} title={`Edit ${t.name}`} aria-label={`Edit ${t.name}`} className="p-1.5 rounded-full text-slate-500 hover:text-blue-600">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setPendingDelete(t)} title={`Delete ${t.name}`} aria-label={`Delete ${t.name}`} className="p-1.5 rounded-full text-slate-500 hover:text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {canManage && (
            <form onSubmit={handleCreate} className="pt-3 border-t border-slate-900/10 dark:border-white/10 space-y-2">
              <fieldset disabled={loadFailed} className="space-y-2">
                <div className="flex gap-2">
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="New tag name…" className={`flex-1 min-w-0 ${FIELD}`} />
                  <button type="submit" disabled={saving || loadFailed} className="px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-60">
                    {saving ? 'Adding…' : 'Add'}
                  </button>
                </div>
                <ColorSwatches value={color} onChange={setColor} label="New tag color" />
              </fieldset>
            </form>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete tag?'}
        message={pendingDelete ? deleteMessage(pendingDelete) : ''}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default TagsModal;
