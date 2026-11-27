import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { DEFAULT_POINTS_SCALE, STATUS_COLUMNS } from '../constants';
import { resolveSprintName } from '../utils/sprint';
import type { BoardImport, SprintConfig, SprintPatch, Task, TaskFormValues, TaskStatus, TeamMember, Toast, ToastType } from '../types';

export interface UseBoardDeps {
  setTaskModal: (v: { open: boolean; task: Task | null; defaultStatus: TaskStatus }) => void;
  clearFilters: () => void;
  newMemberName: string;
  newMemberRole: string;
  setNewMemberName: (v: string) => void;
  setNewMemberRole: (v: string) => void;
}

/** One parsed bulk-add line; `line` is the 1-based source line for error reports. */
export interface BulkMemberEntry {
  line: number;
  name: string;
  role?: string;
}

export interface BulkMemberLineError {
  line: number;
  name: string;
  error: string;
}

export interface BulkAddMembersResult {
  added: TeamMember[];
  errors: BulkMemberLineError[];
}

export interface UseBoard {
  team: TeamMember[];
  tasks: Task[];
  sprints: SprintConfig[];
  pointsScale: number[];
  loading: boolean;
  apiError: string;
  toasts: Toast[];
  setTeam: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showToast: (message: string, type?: ToastType) => void;
  refreshAll: () => Promise<void>;
  updateSprint: (id: string, patch: SprintPatch) => Promise<void>;
  updatePointsScale: (scale: number[]) => Promise<void>;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  promoteTask: (taskId: string) => Promise<void>;
  saveTask: (formValues: TaskFormValues) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  handleUpdateMember: (member: TeamMember) => Promise<void>;
  handleAddMember: (e: React.FormEvent) => Promise<void>;
  handleAddMemberFromUser: (user: { id: number; name: string }) => Promise<void>;
  handleBulkAddMembers: (entries: BulkMemberEntry[]) => Promise<BulkAddMembersResult>;
  handleRemoveMember: (id: string) => Promise<void>;
  handleExportJson: () => void;
  handleImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useBoard(deps: UseBoardDeps): UseBoard {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<SprintConfig[]>([]);
  const [pointsScale, setPointsScale] = useState<number[]>(DEFAULT_POINTS_SCALE);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string>('');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (message: string, type: ToastType = 'info'): void => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2600);
  };

  const refreshAll = async (): Promise<void> => {
    try {
      setApiError('');
      const [teamData, tasksData, sprintsData] = await Promise.all([
        api.getTeam(), api.getTasks(), api.getSprints()
      ]);
      setTeam(teamData);
      setTasks(tasksData);
      setSprints(sprintsData);
      // Fail-soft: an older backend without the scale endpoint (or a
      // transient failure) keeps the default picker options.
      try {
        const scaleData = await api.getPointsScale();
        if (Array.isArray(scaleData?.scale) && scaleData.scale.length > 0) {
          setPointsScale(scaleData.scale);
        }
      } catch {
        /* keep DEFAULT_POINTS_SCALE */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setApiError(
        msg.includes('Missing permissions') || msg.includes('Forbidden')
          ? 'Your role cannot access some data. Contact an admin.'
          : 'Unable to reach the Python SQLite backend. Start uvicorn on port 8000 and retry.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const moveTaskStatus = async (taskId: string, newStatus: TaskStatus): Promise<void> => {
    try {
      const updated = await api.moveTaskStatus(taskId, newStatus);
      setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
      const col = STATUS_COLUMNS.find(c => c.id === newStatus);
      showToast(`Saved ${taskId} to ${col ? col.label : newStatus}`, 'success');
    } catch {
      showToast('Failed to update task status', 'error');
    }
  };

  const promoteTask = async (taskId: string): Promise<void> => {
    try {
      const updated = await api.promoteTask(taskId);
      setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
      showToast(`Pulled ${taskId} into ${resolveSprintName(sprints, updated.sprint)}`, 'success');
    } catch {
      showToast('Failed to promote task', 'error');
    }
  };

  const saveTask = async (formValues: TaskFormValues): Promise<void> => {
    try {
      if (formValues.id) {
        const updated = await api.updateTask(formValues.id, formValues);
        setTasks(prev => prev.map(t => (t.id === formValues.id ? updated : t)));
        showToast(`Updated ${formValues.id}`, 'success');
      } else {
        const created = await api.createTask(formValues);
        setTasks(prev => [created, ...prev]);
        showToast(`Created ${created.id}`, 'success');
      }
      deps.setTaskModal({ open: false, task: null, defaultStatus: 'todo' });
    } catch {
      showToast('Failed to save task to SQLite', 'error');
    }
  };

  const deleteTask = async (taskId: string): Promise<void> => {
    try {
      await api.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      deps.setTaskModal({ open: false, task: null, defaultStatus: 'todo' });
      showToast(`Deleted ${taskId}`, 'info');
    } catch {
      showToast('Failed to delete task', 'error');
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ team, tasks }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sprintflow-board.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported board to sprintflow-board.json', 'success');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string) as BoardImport;
        if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.team)) throw new Error('Invalid format');
        await api.importBoard(parsed);
        await refreshAll();
        showToast(`Imported ${parsed.tasks.length} tasks into SQLite`, 'success');
      } catch {
        showToast('Invalid JSON file or server error', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUpdateMember = async (member: TeamMember): Promise<void> => {
    const snapshot = team;
    setTeam(prev => prev.map(m => (m.id === member.id ? { ...m, ...member } : m)));
    try {
      const updated = await api.updateMember(member.id, member);
      setTeam(prev => prev.map(m => (m.id === member.id ? updated : m)));
    } catch (e) {
      setTeam(snapshot);
      showToast('Failed to update member', 'error');
      throw e instanceof Error ? e : new Error('Failed to update member');
    }
  };

  const handleAddMember = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const name = deps.newMemberName.trim();
    if (!name) return;
    try {
      const created = await api.addMember({ name, role: deps.newMemberRole.trim() || 'Engineer' });
      setTeam(prev => [...prev, created]);
      deps.setNewMemberName('');
      deps.setNewMemberRole('');
      showToast(`Added ${created.name} to team`, 'success');
    } catch {
      showToast('Failed to add member', 'error');
    }
  };

  const handleAddMemberFromUser = async (user: { id: number; name: string }): Promise<void> => {
    try {
      const created = await api.addMember({ name: user.name, role: 'Engineer', userId: user.id });
      setTeam(prev => [...prev, created]);
      showToast(`Added ${created.name} to team`, 'success');
    } catch {
      showToast('Failed to add member', 'error');
      throw new Error('Failed to add member');
    }
  };

  const handleRemoveMember = async (id: string): Promise<void> => {
    if (team.length <= 1) return;
    // L4: pass ?reassignTo (first remaining member) so the server actually
    // reassigns, and report the server's real counts in the toast.
    const target = team.find(m => m.id !== id);
    try {
      const res = await api.deleteMember(id, target?.id);
      await refreshAll();
      const n = res.reassignedTasks ?? 0;
      showToast(
        target ? `Removed member — ${n} ${n === 1 ? 'task' : 'tasks'} reassigned to ${target.name}` : 'Removed member',
        'info'
      );
    } catch (e) {
      showToast('Failed to remove member', 'error');
      throw e instanceof Error ? e : new Error('Failed to remove member');
    }
  };

  const handleBulkAddMembers = async (entries: BulkMemberEntry[]): Promise<BulkAddMembersResult> => {
    const added: TeamMember[] = [];
    const errors: BulkMemberLineError[] = [];
    for (const entry of entries) {
      const name = entry.name.trim();
      if (!name) {
        errors.push({ line: entry.line, name: entry.name, error: 'Missing name' });
        continue;
      }
      try {
        const created = await api.addMember({ name, role: entry.role?.trim() || 'Engineer' });
        added.push(created);
      } catch (e) {
        errors.push({ line: entry.line, name, error: e instanceof Error && e.message ? e.message : 'Failed to add member' });
      }
    }
    if (added.length > 0) setTeam(prev => [...prev, ...added]);
    if (added.length > 0) showToast(`Added ${added.length} ${added.length === 1 ? 'member' : 'members'}`, 'success');
    if (errors.length > 0) showToast(`${errors.length} ${errors.length === 1 ? 'line' : 'lines'} failed`, 'error');
    return { added, errors };
  };

  const updateSprint = async (id: string, patch: SprintPatch): Promise<void> => {
    try {
      const updated = await api.updateSprint(id, patch);
      setSprints(prev => prev.map(s => (s.id === id ? updated : s)));
      showToast(`Updated ${updated.name} sprint settings`, 'success');
    } catch {
      showToast('Failed to update sprint', 'error');
    }
  };

  const updatePointsScale = async (scale: number[]): Promise<void> => {
    try {
      const updated = await api.updatePointsScale(scale);
      setPointsScale(updated.scale);
      showToast(`Points scale updated (${updated.scale.join(', ')})`, 'success');
    } catch {
      showToast('Failed to update points scale', 'error');
      throw new Error('Failed to update points scale');
    }
  };

  return {
    team,
    tasks,
    sprints,
    pointsScale,
    loading,
    apiError,
    toasts,
    setTeam,
    fileInputRef,
    showToast,
    refreshAll,
    updateSprint,
    updatePointsScale,
    moveTaskStatus,
    promoteTask,
    saveTask,
    deleteTask,
    handleUpdateMember,
    handleAddMember,
    handleAddMemberFromUser,
    handleBulkAddMembers,
    handleRemoveMember,
    handleExportJson,
    handleImportJson
  };
}
