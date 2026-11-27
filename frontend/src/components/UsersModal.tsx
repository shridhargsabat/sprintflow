import { useEffect, useState } from 'react';
import type React from 'react';
import { Pencil, ShieldCheck, Trash2, Unlink, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, GLASS_SUBCARD } from '../constants';
import { getInitials } from '../utils/format';
import { api } from '../api';
import type { ManagedUser, Role, UpdateUserPayload } from '../api';
import type { TeamMember } from '../types';
import Dropdown from './Dropdown';
import ConfirmDialog from './ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import { useEscapeKey } from '../hooks/useEscapeKey';

const FIELD =
  'px-3 py-2 rounded-full text-base md:text-xs min-h-[44px] md:min-h-0 field-text bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50';

const ROLES: Role[] = ['admin', 'lead', 'member', 'viewer'];

const ROLE_PILL: Record<Role, string> = {
  admin: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/30',
  lead: 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border-blue-400/30',
  member: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-400/30',
  viewer: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/25'
};

/** Admin-only login-user management. Self-contained: fetches + mutates via api. */
export function UsersModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEscapeKey(onClose);
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [pendingUnlink, setPendingUnlink] = useState<TeamMember | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [memberId, setMemberId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eName, setEName] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [ePassword, setEPassword] = useState('');
  const [eRole, setERole] = useState<Role>('member');
  const [eSaving, setESaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listUsers()
      .then(u => { if (!cancelled) setUsers(u); })
      .catch(e => {
        if (!cancelled) {
          setLoadFailed(true);
          setError(e instanceof Error ? e.message : 'Failed to load users');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    api.getTeam()
      .then(t => { if (!cancelled) setTeam(t); })
      .catch(() => { /* link chips unavailable; linking still works from Team modal */ });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = (e: React.FormEvent): void => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    api.createUser({ name: name.trim(), email: email.trim(), password, role })
      .then(async u => {
        if (memberId !== '') {
          const tm = team.find(t => t.id === memberId);
          if (tm) {
            try {
              const updated = await api.updateMember(tm.id, { name: tm.name, role: tm.role, color: tm.color, userId: u.id });
              setTeam(prev => prev.map(t => (t.id === tm.id ? updated : t)));
            } catch (err) {
              setError(err instanceof Error ? `User created, but link failed: ${err.message}` : 'User created, but link failed');
            }
          }
        }
        setUsers(prev => [...prev, u]);
        setName(''); setEmail(''); setPassword(''); setRole('member'); setMemberId('');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to create user'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (id: number): void => {
    setError(null);
    api.deleteUser(id)
      .then(() => setUsers(prev => prev.filter(u => u.id !== id)))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to delete user'));
  };

  const handleUnlink = (tm: TeamMember): void => {
    setError(null);
    api.updateMember(tm.id, { name: tm.name, role: tm.role, color: tm.color, userId: null })
      .then(updated => setTeam(prev => prev.map(t => (t.id === tm.id ? updated : t))))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to unlink member'));
  };

  const confirmDelete = (): void => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target) handleDelete(target.id);
  };

  const confirmUnlink = (): void => {
    const target = pendingUnlink;
    setPendingUnlink(null);
    if (target) handleUnlink(target);
  };

  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? users
    : users.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );

  const startEdit = (u: ManagedUser): void => {
    setEditingId(u.id);
    setEName(u.name);
    setEEmail(u.email);
    setEPassword('');
    setERole(u.role);
    setError(null);
  };

  const handleSaveEdit = (u: ManagedUser): void => {
    const isSelf = me != null && String(me.id) === String(u.id);
    if (ePassword.trim() !== '' && ePassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    const patch: UpdateUserPayload = {};
    if (eName.trim() !== '' && eName.trim() !== u.name) patch.name = eName.trim();
    if (eEmail.trim() !== '' && eEmail.trim().toLowerCase() !== u.email) patch.email = eEmail.trim();
    if (ePassword.trim() !== '') patch.password = ePassword;
    if (!isSelf && eRole !== u.role) patch.role = eRole;
    if (Object.keys(patch).length === 0) { setEditingId(null); return; }
    setESaving(true);
    setError(null);
    api.updateUser(u.id, patch)
      .then(updated => {
        setUsers(prev => prev.map(x => (x.id === u.id ? updated : x)));
        setEditingId(null);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to update user'))
      .finally(() => setESaving(false));
  };

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-md rounded-[32px] overflow-hidden flex flex-col md:block max-h-[90vh] md:max-h-none ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-500" /> Manage Users
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">Login accounts &amp; roles (admin only)</p>
          </div>
          <button type="button" onClick={onClose} className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto scroll-slim md:overflow-visible min-h-0">
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
              placeholder="Search name, email, or role…"
              aria-label="Search users"
              className={`flex-1 min-w-0 ${FIELD}`}
            />
            <span className="text-[11px] text-slate-500 shrink-0" aria-live="polite">
              {filtered.length} of {users.length}
            </span>
          </div>
          <div className="space-y-2.5 max-h-56 overflow-y-auto scroll-slim pr-1">
            {loading && <div className="text-xs text-slate-500 py-4 text-center">Loading users…</div>}
            {!loading && users.length === 0 && !loadFailed && (
              <div className="text-xs text-slate-500 py-4 text-center">No users yet</div>
            )}
            {!loading && users.length === 0 && loadFailed && (
              <div className="text-xs text-slate-500 py-4 text-center">Cannot load users — insufficient permission</div>
            )}
            {!loading && users.length > 0 && filtered.length === 0 && (
              <div className="text-xs text-slate-500 py-4 text-center">No matching users</div>
            )}
            {filtered.map(u => {
              const isSelf = me != null && String(me.id) === String(u.id);
              if (editingId === u.id) {
                return (
                  <div key={u.id} className={`p-2.5 rounded-2xl space-y-2 ${GLASS_SUBCARD}`}>
                    <div className="flex gap-2">
                      <input type="text" value={eName} onChange={e => setEName(e.target.value)} placeholder="Full name" className={`flex-1 min-w-0 ${FIELD}`} />
                      {!isSelf ? (
                        <div className="w-32 md:w-28 shrink-0">
                          <Dropdown
                            value={eRole}
                            onChange={(v) => setERole(v as Role)}
                            options={ROLES.map(r => ({ value: r, label: r }))}
                            className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 field-text ${GLASS_PILL}`}
                          />
                        </div>
                      ) : (
                        <span className={`px-2 py-2 rounded-full text-[10px] font-bold uppercase tracking-wide border self-center ${ROLE_PILL[u.role]}`}>
                          {u.role}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input type="email" value={eEmail} onChange={e => setEEmail(e.target.value)} placeholder="Email" className={`flex-1 min-w-0 ${FIELD}`} />
                      <input type="password" value={ePassword} onChange={e => setEPassword(e.target.value)} placeholder="New pw (blank=keep)" className={`w-36 ${FIELD}`} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditingId(null)} className="px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[44px] md:min-h-0 hover:bg-white/60 dark:hover:bg-white/10">Cancel</button>
                      <button type="button" onClick={() => handleSaveEdit(u)} disabled={eSaving} className="px-4 py-1.5 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-60">
                        {eSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              }
              return (
              <div key={u.id} className={`flex items-center gap-2.5 p-2 rounded-2xl ${GLASS_SUBCARD}`}>
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {getInitials(u.name)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold truncate">
                    {u.name}
                    {isSelf && <span className="ml-1.5 font-normal text-slate-500">(you)</span>}
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">{u.email}</span>
                  {(() => {
                    const tm = team.find(t => t.userId === u.id);
                    if (!tm) return null;
                    return (
                      <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-200 border border-blue-400/25">
                        {tm.name}
                        <button type="button" onClick={() => setPendingUnlink(tm)} title={`Unlink ${tm.name}`} className="hover:text-rose-600 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 inline-flex items-center justify-center -my-1">
                          <Unlink className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })()}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${ROLE_PILL[u.role]}`}>
                  {u.role}
                </span>
                <button type="button" onClick={() => startEdit(u)} title={`Edit ${u.email}`} className="p-1.5 rounded-full text-slate-500 hover:text-blue-600 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!isSelf && (
                  <button type="button" onClick={() => setPendingDelete(u)} title={`Delete ${u.email}`} className="p-1.5 rounded-full text-slate-500 hover:text-rose-600 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              );
            })}
          </div>
          <form onSubmit={handleCreate} className="pt-3 border-t border-slate-900/10 dark:border-white/10">
            <fieldset disabled={loadFailed} className="space-y-2 min-w-0">
            <div className="flex gap-2">
              <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className={`flex-1 min-w-0 ${FIELD}`} />
              <div className="w-32 md:w-28 shrink-0">
                <Dropdown
                  value={role}
                  onChange={(v) => setRole(v as Role)}
                  options={ROLES.map(r => ({ value: r, label: r }))}
                  className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 field-text ${GLASS_PILL}`}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className={`flex-1 min-w-0 ${FIELD}`} />
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (8+)" className={`w-32 ${FIELD}`} />
            </div>
            <Dropdown
              value={memberId}
              onChange={setMemberId}
              options={[{ value: '', label: 'Link team member (optional)' }, ...team.filter(t => t.userId == null).map(t => ({ value: t.id, label: `${t.name} (${t.role})` }))]}
              className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-base md:text-xs min-h-[44px] md:min-h-0 field-text ${GLASS_PILL}`}
            />
            <button type="submit" disabled={saving || loadFailed} className="w-full px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] md:min-h-0 bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-60">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            </fieldset>
          </form>
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete user"
        message={pendingDelete ? `Delete login ${pendingDelete.name} ${pendingDelete.email}?` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={pendingUnlink !== null}
        title="Unlink member"
        message="Unlink member from login?"
        confirmLabel="Unlink"
        onConfirm={confirmUnlink}
        onCancel={() => setPendingUnlink(null)}
      />
    </div>
  );
}

export default UsersModal;
