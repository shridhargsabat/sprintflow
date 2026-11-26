import { useEffect, useState } from 'react';
import type React from 'react';
import { Pencil, ShieldCheck, Trash2, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, GLASS_SUBCARD } from '../constants';
import { getInitials } from '../utils/format';
import { api } from '../api';
import type { ManagedUser, Role, UpdateUserPayload } from '../api';
import Dropdown from './Dropdown';
import { useAuth } from '../auth/AuthContext';
import { useEscapeKey } from '../hooks/useEscapeKey';

const FIELD =
  'px-3 py-2 rounded-full text-xs field-text bg-slate-900/[0.05] dark:bg-black/25 backdrop-blur-xl border border-white/60 dark:border-white/[0.14] shadow-[inset_0_2px_8px_rgba(15,23,42,0.10),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] outline-none transition focus:border-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500/50';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
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
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load users'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = (e: React.FormEvent): void => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    api.createUser({ name: name.trim(), email: email.trim(), password, role })
      .then(u => {
        setUsers(prev => [...prev, u]);
        setName(''); setEmail(''); setPassword(''); setRole('member');
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
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-md rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-500" /> Manage Users
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">Login accounts &amp; roles (admin only)</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="px-3.5 py-2 rounded-2xl text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/30">
              {error}
            </div>
          )}
          <div className="space-y-2.5 max-h-56 overflow-y-auto scroll-slim pr-1">
            {loading && <div className="text-xs text-slate-500 py-4 text-center">Loading users…</div>}
            {users.map(u => {
              const isSelf = me != null && String(me.id) === String(u.id);
              if (editingId === u.id) {
                return (
                  <div key={u.id} className={`p-2.5 rounded-2xl space-y-2 ${GLASS_SUBCARD}`}>
                    <div className="flex gap-2">
                      <input type="text" value={eName} onChange={e => setEName(e.target.value)} placeholder="Full name" className={`flex-1 min-w-0 ${FIELD}`} />
                      {!isSelf ? (
                        <div className="w-28 shrink-0">
                          <Dropdown
                            value={eRole}
                            onChange={(v) => setERole(v as Role)}
                            options={ROLES.map(r => ({ value: r, label: r }))}
                            className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-xs field-text ${GLASS_PILL}`}
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
                      <button type="button" onClick={() => setEditingId(null)} className="px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10">Cancel</button>
                      <button type="button" onClick={() => handleSaveEdit(u)} disabled={eSaving} className="px-4 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-60">
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
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${ROLE_PILL[u.role]}`}>
                  {u.role}
                </span>
                <button type="button" onClick={() => startEdit(u)} title={`Edit ${u.email}`} className="p-1.5 rounded-full text-slate-500 hover:text-blue-600">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!isSelf && (
                  <button type="button" onClick={() => handleDelete(u.id)} title={`Delete ${u.email}`} className="p-1.5 rounded-full text-slate-500 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              );
            })}
          </div>
          <form onSubmit={handleCreate} className="space-y-2 pt-3 border-t border-slate-900/10 dark:border-white/10">
            <div className="flex gap-2">
              <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className={`flex-1 min-w-0 ${FIELD}`} />
              <div className="w-28 shrink-0">
                <Dropdown
                  value={role}
                  onChange={(v) => setRole(v as Role)}
                  options={ROLES.map(r => ({ value: r, label: r }))}
                  className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-xs field-text ${GLASS_PILL}`}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className={`flex-1 min-w-0 ${FIELD}`} />
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (8+)" className={`w-32 ${FIELD}`} />
            </div>
            <button type="submit" disabled={saving} className="w-full px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white disabled:opacity-60">
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default UsersModal;
