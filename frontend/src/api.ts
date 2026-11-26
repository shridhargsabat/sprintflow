import type { BoardImport, Task, TaskPayload, TaskStatus, TeamMember } from './types';

const API_BASE: string = import.meta.env.VITE_API_URL || '/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface MemberPayload {
  name: string;
  role?: string;
  color?: string;
}

export const api = {
  getTasks: (): Promise<Task[]> => request<Task[]>('/tasks'),
  createTask: (payload: TaskPayload): Promise<Task> =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id: string, payload: TaskPayload): Promise<Task> =>
    request<Task>(`/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  moveTaskStatus: (id: string, status: TaskStatus): Promise<Task> =>
    request<Task>(`/tasks/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  promoteTask: (id: string): Promise<Task> =>
    request<Task>(`/tasks/${encodeURIComponent(id)}/promote`, { method: 'POST' }),
  deleteTask: (id: string): Promise<{ deleted: string }> =>
    request<{ deleted: string }>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getTeam: (): Promise<TeamMember[]> => request<TeamMember[]>('/team'),
  addMember: (payload: MemberPayload): Promise<TeamMember> =>
    request<TeamMember>('/team', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id: string, payload: MemberPayload): Promise<TeamMember> =>
    request<TeamMember>(`/team/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id: string): Promise<{ deleted: string }> =>
    request<{ deleted: string }>(`/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  importBoard: (payload: BoardImport): Promise<{ team: number; tasks: number }> =>
    request<{ team: number; tasks: number }>('/import', { method: 'POST', body: JSON.stringify(payload) }),
  resetBoard: (): Promise<{ status: string }> =>
    request<{ status: string }>('/reset', { method: 'POST' })
};
