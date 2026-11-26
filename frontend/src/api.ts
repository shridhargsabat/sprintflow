import type { BoardImport, SprintConfig, SprintPatch, Task, TaskPayload, TaskStatus, TeamMember } from './types';

const API_BASE: string = import.meta.env.VITE_API_URL || '/api';

export const TOKEN_KEY = 'sf_token';

export type Role = 'admin' | 'lead' | 'member' | 'viewer';

export interface AuthUser {
  id: string | number;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface MeResponse {
  id: string | number;
  email: string;
  name: string;
  role: Role;
  permissions: string[];
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

type AuthExpiredHandler = () => void;
let authExpiredHandler: AuthExpiredHandler | null = null;

/** Registered by AuthProvider: invoked on any authenticated 401. */
export function setAuthExpiredHandler(handler: AuthExpiredHandler | null): void {
  authExpiredHandler = handler;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: string;
  /** Skip the global 401 -> auth-expired handler (used by the auth endpoints themselves). */
  skipAuthHandler?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthHandler, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string> | undefined) || {})
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  if (res.status === 401 && !skipAuthHandler) {
    authExpiredHandler?.();
    const text = await res.text();
    throw new Error(text || 'Session expired (401)');
  }
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
    request<{ status: string }>('/reset', { method: 'POST' }),

  getSprints: (): Promise<SprintConfig[]> => request<SprintConfig[]>('/sprints'),
  updateSprint: (id: string, patch: SprintPatch): Promise<SprintConfig> =>
    request<SprintConfig>(`/sprints/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),

  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthHandler: true
    }),
  getMe: (): Promise<MeResponse> => request<MeResponse>('/auth/me', { skipAuthHandler: true })
};
