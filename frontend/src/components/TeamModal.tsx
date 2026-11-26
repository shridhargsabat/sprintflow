import type React from 'react';
import { Trash2, X } from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL, GLASS_SUBCARD } from '../constants';
import { getInitials } from '../utils/format';
import type { TeamMember } from '../types';

export interface TeamModalProps {
  team: TeamMember[];
  newMemberName: string;
  newMemberRole: string;
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onUpdateMember: (member: TeamMember) => void;
  onAddMember: (e: React.FormEvent) => void;
  onRemoveMember: (id: string) => void;
  onRenameMember: (id: string, patch: Partial<TeamMember>) => void;
  onClose: () => void;
}

export function TeamModal({ team, newMemberName, newMemberRole, onNameChange, onRoleChange, onUpdateMember, onAddMember, onRemoveMember, onRenameMember, onClose }: TeamModalProps) {
  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-md rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Manage Team Members</h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">Edits save directly to SQLite on blur</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2.5 max-h-64 overflow-y-auto scroll-slim pr-1">
            {team.map(m => (
              <div key={m.id} className={`flex items-center gap-2 p-2 rounded-2xl ${GLASS_SUBCARD}`}>
                <span className={`w-8 h-8 rounded-full ${m.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{getInitials(m.name)}</span>
                <input type="text" value={m.name} onChange={e => onRenameMember(m.id, { name: e.target.value })} onBlur={() => onUpdateMember(m)} className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
                <input type="text" value={m.role || ''} placeholder="Role" onChange={e => onRenameMember(m.id, { role: e.target.value })} onBlur={() => onUpdateMember(m)} className="w-24 px-2 py-1.5 rounded-xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
                {team.length > 1 && (
                  <button type="button" onClick={() => onRemoveMember(m.id)} className="p-1.5 rounded-full text-slate-500 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={onAddMember} className="flex gap-2 pt-3 border-t border-slate-900/10 dark:border-white/10">
            <input type="text" required value={newMemberName} onChange={e => onNameChange(e.target.value)} placeholder="Add team member..." className={`flex-1 px-3.5 py-2 rounded-full text-xs ${GLASS_PILL}`} />
            <input type="text" value={newMemberRole} onChange={e => onRoleChange(e.target.value)} placeholder="Role" className={`w-24 px-3 py-2 rounded-full text-xs ${GLASS_PILL}`} />
            <button type="submit" className="px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}
