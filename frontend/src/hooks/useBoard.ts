import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { STATUS_COLUMNS } from '../constants';
import type { BoardImport, SprintConfig, SprintPatch, Task, TaskFormValues, TaskStatus, TeamMember, Toast, ToastType } from '../types';

export interface UseBoardDeps {
  setTaskModal: (v: { open: boolean; task: Task | null; defaultStatus: TaskStatus }) => void;
  clearFilters: () => void;
  newMemberName: string;
  newMemberRole: string;
  setNewMemberName: (v: string) => void;
  setNewMemberRole: (v: string) => void;
}

export interface UseBoard {
  team: TeamMember[];
  tasks: Task[];
  sprints: SprintConfig[];
  loading: boolean;
  apiError: string;
  toasts: Toast[];
  setTeam: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showToast: (message: string, type?: ToastType) => void;
  refreshAll: () => Promise<void>;
  updateSprint: (id: string, patch: SprintPatch) => Promise<void>;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  promoteTask: (taskId: string) => Promise<void>;
  saveTask: (formValues: TaskFormValues) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  handleUpdateMember: (member: TeamMember) => Promise<void>;
  handleAddMember: (e: React.FormEvent) => Promise<void>;
  handleRemoveMember: (id: string) => Promise<void>;
  handleExportJson: () => void;
  handleImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetDemo: () => Promise<void>;
}

export function useBoard(deps: UseBoardDeps): UseBoard {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<SprintConfig[]>([]);
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
      const [teamData, tasksData, sprintsData] = await Promise.all([api.getTeam(), api.getTasks(), api.getSprints()]);
      setTeam(teamData);
      setTasks(tasksData);
      setSprints(sprintsData);
    } catch {
      setApiError('Unable to reach the Python SQLite backend. Start uvicorn on port 8000 and retry.');
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
      showToast(`Pulled ${taskId} into Sprint 14`, 'success');
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

  const handleResetDemo = async () => {
    try {
      await api.resetBoard();
      deps.clearFilters();
      await refreshAll();
      showToast('Reset SQLite database to sample data', 'info');
    } catch {
      showToast('Failed to reset database', 'error');
    }
  };

  const handleUpdateMember = async (member: TeamMember): Promise<void> => {
    try {
      const updated = await api.updateMember(member.id, member);
      setTeam(prev => prev.map(m => (m.id === member.id ? updated : m)));
    } catch {
      showToast('Failed to update member', 'error');
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

  const handleRemoveMember = async (id: string): Promise<void> => {
    if (team.length <= 1) return;
    try {
      await api.deleteMember(id);
      await refreshAll();
      showToast('Removed member and reassigned tasks', 'info');
    } catch {
      showToast('Failed to remove member', 'error');
    }
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

  return {
    team,
    tasks,
    sprints,
    loading,
    apiError,
    toasts,
    setTeam,
    fileInputRef,
    showToast,
    refreshAll,
    updateSprint,
    moveTaskStatus,
    promoteTask,
    saveTask,
    deleteTask,
    handleUpdateMember,
    handleAddMember,
    handleRemoveMember,
    handleExportJson,
    handleImportJson,
    handleResetDemo
  };
}
