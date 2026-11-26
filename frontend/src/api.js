const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  getTasks: () => request('/tasks'),
  createTask: (payload) => request('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id, payload) => request(`/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  moveTaskStatus: (id, status) => request(`/tasks/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  promoteTask: (id) => request(`/tasks/${encodeURIComponent(id)}/promote`, { method: 'POST' }),
  deleteTask: (id) => request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getTeam: () => request('/team'),
  addMember: (payload) => request('/team', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id, payload) => request(`/team/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id) => request(`/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  importBoard: (payload) => request('/import', { method: 'POST', body: JSON.stringify(payload) }),
  resetBoard: () => request('/reset', { method: 'POST' })
};
