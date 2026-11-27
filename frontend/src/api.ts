import type { BoardImport, SprintConfig, SprintPatch, SprintStatus, Task, TaskActivityEntry, TaskPayload, TaskStatus, TeamMember } from './types';

export type { SprintStatus };

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

export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface UserDirectoryEntry {
  id: number;
  name: string;
  email: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  taskCount: number;
}

/** Shape of the 409 body when a tag still in use cannot be deleted. */
export interface TagDeleteConflict {
  tasks: number;
}

export interface CreateTagPayload {
  name: string;
  color?: string;
}

export interface UpdateTagPayload {
  name?: string;
  color?: string;
}

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  role: Role;
}

export interface UpdateUserPayload {
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
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

/** Typed fetch failure: HTTP status + human message + parsed body (if JSON). */
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * L5: turn an error response body into a banner-ready message. Parses the
 * FastAPI `{detail}` envelope (string, list of {loc,msg}, or {errors[]})
 * and the tag-delete 409 `{tasks:N}` shape instead of showing raw JSON.
 */
export function parseErrorMessage(status: number, text: string): { message: string; data: unknown } {
  if (!text) return { message: `Request failed (${status})`, data: null };
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    return { message: text, data: null };
  }
  if (isRecord(data)) {
    const detail = data.detail;
    if (typeof detail === 'string' && detail.trim() !== '') return { message: detail, data };
    if (Array.isArray(detail)) {
      const parts = detail
        .map(e => {
          if (typeof e === 'string') return e;
          if (isRecord(e) && typeof e.msg === 'string') {
            const loc = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : '';
            return loc ? `${loc}: ${e.msg}` : e.msg;
          }
          return null;
        })
        .filter((s): s is string => s !== null);
      if (parts.length > 0) return { message: parts.slice(0, 5).join('; '), data };
    } else if (isRecord(detail) && Array.isArray(detail.errors)) {
      const errs = detail.errors.filter((e): e is string => typeof e === 'string');
      if (errs.length > 0) return { message: errs.slice(0, 5).join('; '), data };
    }
    if (status === 409 && typeof data.tasks === 'number') {
      const n = data.tasks;
      return { message: `Tag is used by ${n} ${n === 1 ? 'task' : 'tasks'} — retag those tasks first`, data };
    }
  }
  return { message: text, data };
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
    const { message, data } = parseErrorMessage(res.status, text);
    throw new ApiError(res.status, message || 'Session expired (401)', data);
  }
  if (!res.ok) {
    const text = await res.text();
    const { message, data } = parseErrorMessage(res.status, text);
    throw new ApiError(res.status, message, data);
  }
  return res.json() as Promise<T>;
}

export interface CreateSprintPayload {
  name: string;
  startDate: string;
  lengthDays?: number;
}

export interface CloseSprintResult {
  closed: string;
  moved: number;
  to: string;
}

export interface RolloverSprintResult {
  moved: number;
  task_ids: string[];
  from: string;
  to: string;
}

export interface MemberPayload {
  name: string;
  role?: string;
  color?: string;
  userId?: number | null;
}

/** L4: DELETE /api/team/{id} reports what actually happened to the tasks. */
export interface DeleteMemberResponse {
  deleted: string;
  reassignedTasks: number;
  fallback: string | null;
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
  getTaskActivity: (id: string): Promise<TaskActivityEntry[]> =>
    request<TaskActivityEntry[]>(`/tasks/${encodeURIComponent(id)}/activity`),

  getTeam: (): Promise<TeamMember[]> => request<TeamMember[]>('/team'),
  addMember: (payload: MemberPayload): Promise<TeamMember> =>
    request<TeamMember>('/team', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id: string, payload: MemberPayload): Promise<TeamMember> =>
    request<TeamMember>(`/team/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id: string, reassignTo?: string): Promise<DeleteMemberResponse> => {
    const qs = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : '';
    return request<DeleteMemberResponse>(`/team/${encodeURIComponent(id)}${qs}`, { method: 'DELETE' });
  },

  importBoard: (payload: BoardImport): Promise<{ team: number; tasks: number }> =>
    request<{ team: number; tasks: number }>('/import', { method: 'POST', body: JSON.stringify(payload) }),
  getSprints: (): Promise<SprintConfig[]> => request<SprintConfig[]>('/sprints'),
  updateSprint: (id: string, patch: SprintPatch): Promise<SprintConfig> =>
    request<SprintConfig>(`/sprints/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  createSprint: (payload: CreateSprintPayload): Promise<SprintConfig> =>
    request<SprintConfig>('/sprints', { method: 'POST', body: JSON.stringify(payload) }),
  activateSprint: (id: string): Promise<SprintConfig> =>
    request<SprintConfig>(`/sprints/${encodeURIComponent(id)}/activate`, { method: 'POST' }),
  closeSprint: (id: string, rolloverTo?: string): Promise<CloseSprintResult> =>
    request<CloseSprintResult>(`/sprints/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      body: JSON.stringify(rolloverTo ? { rolloverTo } : {})
    }),
  rolloverSprint: (id: string, targetSprint: string): Promise<RolloverSprintResult> =>
    request<RolloverSprintResult>(`/sprints/${encodeURIComponent(id)}/rollover`, {
      method: 'POST',
      body: JSON.stringify({ target_sprint: targetSprint })
    }),

  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthHandler: true
    }),
  getMe: (): Promise<MeResponse> => request<MeResponse>('/auth/me', { skipAuthHandler: true }),

  listUsers: (): Promise<ManagedUser[]> => request<ManagedUser[]>('/auth/users'),
  createUser: (payload: CreateUserPayload): Promise<ManagedUser> =>
    request<ManagedUser>('/auth/users', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (id: number): Promise<{ deleted: number }> =>
    request<{ deleted: number }>(`/auth/users/${id}`, { method: 'DELETE' }),
  updateUser: (id: number, payload: UpdateUserPayload): Promise<ManagedUser> =>
    request<ManagedUser>(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listUserDirectory: (): Promise<UserDirectoryEntry[]> =>
    request<UserDirectoryEntry[]>('/users/directory'),

  listTags: (): Promise<Tag[]> => request<Tag[]>('/tags'),
  createTag: (payload: CreateTagPayload): Promise<Tag> =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify(payload) }),
  updateTag: (id: string, payload: UpdateTagPayload): Promise<Tag> =>
    request<Tag>(`/tags/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTag: (id: string): Promise<{ deleted: string }> =>
    request<{ deleted: string }>(`/tags/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getPointsScale: (): Promise<{ scale: number[] }> =>
    request<{ scale: number[] }>('/settings/points-scale'),
  updatePointsScale: (scale: number[]): Promise<{ scale: number[] }> =>
    request<{ scale: number[] }>('/settings/points-scale', { method: 'PUT', body: JSON.stringify({ scale }) })
};
