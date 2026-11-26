import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  LayoutGrid,
  Kanban,
  ListChecks,
  Users,
  MoreVertical,
  Moon,
  Sun,
  Plus,
  Search,
  Flag,
  CalendarClock,
  ArrowRight,
  UserCog,
  Download,
  Upload,
  RotateCcw,
  X,
  Trash2,
  Database,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Line
} from 'recharts';
import { api } from './api';

const TODAY_ISO = '2026-11-26';

const STATUS_COLUMNS = [
  { id: 'backlog', label: 'Backlog', dot: 'bg-slate-400', badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-white/40 dark:border-white/10' },
  { id: 'todo', label: 'To Do', dot: 'bg-sky-500', badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/25' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-blue-500', badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/25' },
  { id: 'in_review', label: 'In Review', dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/25' },
  { id: 'done', label: 'Done', dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/25' }
];

const PRIORITY_META = {
  critical: { label: 'Critical', weight: 4, color: '#ff3b30', pill: 'bg-rose-500/15 text-rose-700 border-rose-400/30 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-400/30', dot: 'bg-rose-500' },
  high:     { label: 'High',     weight: 3, color: '#ff9500', pill: 'bg-amber-500/15 text-amber-800 border-amber-400/30 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-400/30', dot: 'bg-amber-500' },
  medium:   { label: 'Medium',   weight: 2, color: '#007aff', pill: 'bg-blue-500/15 text-blue-700 border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200 dark:border-blue-400/30', dot: 'bg-blue-500' },
  low:      { label: 'Low',      weight: 1, color: '#8e8e93', pill: 'bg-slate-500/15 text-slate-700 border-slate-400/25 dark:bg-white/10 dark:text-slate-300 dark:border-white/15', dot: 'bg-slate-400' }
};

const GLASS_PANEL =
  'bg-white/55 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/75 dark:border-white/[0.14] shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_0_rgba(255,255,255,0.85)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.16)]';

const GLASS_SUBCARD =
  'lg-card-hover lg-press bg-white/45 dark:bg-white/[0.05] backdrop-blur-xl border border-white/65 dark:border-white/[0.10] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.10)] hover:bg-white/70 dark:hover:bg-white/[0.09] hover:border-white/90 dark:hover:border-white/25 transition-all duration-200';

const GLASS_PILL =
  'lg-press bg-white/55 dark:bg-white/[0.08] backdrop-blur-xl border border-white/75 dark:border-white/[0.14] shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.15)]';

function getInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || '?').slice(0, 2).toUpperCase();
}

function formatShortDate(iso) {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDueMeta(iso, status) {
  if (status === 'done') return { text: formatShortDate(iso), cls: 'text-emerald-600 dark:text-emerald-400' };
  if (!iso) return { text: 'TBD', cls: 'text-slate-400' };
  const today = new Date(TODAY_ISO + 'T00:00:00');
  const due = new Date(iso + 'T00:00:00');
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return { text: `${formatShortDate(iso)} · Overdue`, cls: 'text-rose-600 dark:text-rose-400 font-semibold' };
  if (diffDays === 0) return { text: 'Today', cls: 'text-rose-600 dark:text-rose-400 font-semibold' };
  if (diffDays <= 2) return { text: `${formatShortDate(iso)} (${diffDays}d)`, cls: 'text-amber-600 dark:text-amber-300 font-semibold' };
  return { text: formatShortDate(iso), cls: 'text-slate-600 dark:text-slate-400' };
}

export default function App() {
  const [team, setTeam] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  const [activeView, setActiveView] = useState('bento');
  const [sprintFilter, setSprintFilter] = useState('Sprint 14');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [backlogSort, setBacklogSort] = useState('priority');

  const [menuOpen, setMenuOpen] = useState(false);
  const [taskModal, setTaskModal] = useState({ open: false, task: null, defaultStatus: 'todo' });
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [toasts, setToasts] = useState([]);

  const fileInputRef = useRef(null);

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2600);
  };

  const refreshAll = async () => {
    try {
      setApiError('');
      const [teamData, tasksData] = await Promise.all([api.getTeam(), api.getTasks()]);
      setTeam(teamData);
      setTasks(tasksData);
    } catch {
      setApiError('Unable to reach the Python SQLite backend. Start uvicorn on port 8000 and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const getMember = (id) =>
    team.find(m => m.id === id) || { id: 'unassigned', name: 'Unassigned', role: 'Open', color: 'bg-slate-400' };

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (sprintFilter !== 'all') {
        if (sprintFilter === 'Backlog') {
          if (t.sprint !== 'Backlog' && t.status !== 'backlog') return false;
        } else if (t.sprint !== sprintFilter) {
          return false;
        }
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all' && t.assigneeId !== assigneeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const m = getMember(t.assigneeId);
        const hay = [t.id, t.title, t.description, t.tag, m.name, t.sprint].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, team, sprintFilter, priorityFilter, assigneeFilter, searchQuery]);

  const allBacklogTasks = useMemo(
    () => tasks.filter(t => t.status === 'backlog').sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight),
    [tasks]
  );

  const kpis = useMemo(() => {
    const totalTasks = filteredTasks.length;
    const doneTasks = filteredTasks.filter(t => t.status === 'done').length;
    const totalPts = filteredTasks.reduce((s, t) => s + Number(t.points || 0), 0);
    const donePts = filteredTasks.filter(t => t.status === 'done').reduce((s, t) => s + Number(t.points || 0), 0);
    const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : (totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0);
    return {
      totalTasks,
      doneTasks,
      totalPts,
      donePts,
      pct,
      ongoing: filteredTasks.filter(t => t.status === 'in_progress').length,
      review: filteredTasks.filter(t => t.status === 'in_review').length,
      backlog: allBacklogTasks.length,
      criticalOpen: filteredTasks.filter(t => t.priority === 'critical' && t.status !== 'done').length
    };
  }, [filteredTasks, allBacklogTasks]);

  const priorityData = useMemo(() => {
    return Object.keys(PRIORITY_META).map(key => ({
      key,
      name: PRIORITY_META[key].label,
      value: filteredTasks.filter(t => t.priority === key).length,
      color: PRIORITY_META[key].color
    }));
  }, [filteredTasks]);

  const burndownData = useMemo(() => {
    const total = Math.max(kpis.totalPts, 10);
    const remaining = Math.max(0, kpis.totalPts - kpis.donePts);
    const labels = ['Nov 23', 'Nov 25', 'Nov 27', 'Nov 29', 'Dec 1', 'Dec 3', 'Dec 6'];
    return labels.map((day, i) => ({
      day,
      ideal: Math.round(total * (1 - i / (labels.length - 1))),
      remaining: i === 0 ? total : i === 1 ? Math.round(total - kpis.donePts * 0.65) : i === 2 ? remaining : null
    }));
  }, [kpis.totalPts, kpis.donePts]);

  const burndownOnTrack = useMemo(() => {
    const remaining = Math.max(0, kpis.totalPts - kpis.donePts);
    const targetDay3 = burndownData[2] ? burndownData[2].ideal : 0;
    return remaining <= targetDay3 + 3;
  }, [kpis.totalPts, kpis.donePts, burndownData]);

  const sprintHeader = useMemo(() => {
    if (sprintFilter === 'Sprint 14') {
      return { badge: 'Sprint 14 · Active', dates: 'Nov 23 – Dec 6, 2026', title: 'Core Platform v2.4 Delivery', sub: '10 days remaining · Synced with SQLite backend' };
    }
    if (sprintFilter === 'Sprint 15') {
      return { badge: 'Sprint 15 · Planned', dates: 'Dec 7 – Dec 20, 2026', title: 'Scale & Reliability Hardening', sub: 'Starts in 11 days · Backlog grooming & capacity planning' };
    }
    if (sprintFilter === 'Backlog') {
      return { badge: 'Product Backlog', dates: 'Unscheduled Queue', title: 'Upcoming Engineering Backlog', sub: 'Prioritized work ready to pull into upcoming sprints' };
    }
    return { badge: 'All Sprints · Portfolio', dates: 'Q4 2026 Roadmap', title: 'Full Project Delivery Overview', sub: 'Combined view of active sprint, planned sprint & backlog' };
  }, [sprintFilter]);

  const hasActiveFilters = priorityFilter !== 'all' || assigneeFilter !== 'all' || searchQuery.trim() !== '' || sprintFilter !== 'Sprint 14';

  const clearFilters = () => {
    setSprintFilter('Sprint 14');
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setSearchQuery('');
  };

  const moveTaskStatus = async (taskId, newStatus) => {
    try {
      const updated = await api.moveTaskStatus(taskId, newStatus);
      setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
      const col = STATUS_COLUMNS.find(c => c.id === newStatus);
      showToast(`Saved ${taskId} to ${col ? col.label : newStatus}`, 'success');
    } catch {
      showToast('Failed to update task status', 'error');
    }
  };

  const promoteTask = async (taskId) => {
    try {
      const updated = await api.promoteTask(taskId);
      setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
      showToast(`Pulled ${taskId} into Sprint 14`, 'success');
    } catch {
      showToast('Failed to promote task', 'error');
    }
  };

  const saveTask = async (formValues) => {
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
      setTaskModal({ open: false, task: null, defaultStatus: 'todo' });
    } catch {
      showToast('Failed to save task to SQLite', 'error');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setTaskModal({ open: false, task: null, defaultStatus: 'todo' });
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
    setMenuOpen(false);
    showToast('Exported board to sprintflow-board.json', 'success');
  };

  const handleImportJson = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
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
    setMenuOpen(false);
  };

  const handleResetDemo = async () => {
    try {
      await api.resetBoard();
      clearFilters();
      await refreshAll();
      setMenuOpen(false);
      showToast('Reset SQLite database to sample data', 'info');
    } catch {
      showToast('Failed to reset database', 'error');
    }
  };

  const handleUpdateMember = async (member) => {
    try {
      const updated = await api.updateMember(member.id, member);
      setTeam(prev => prev.map(m => (m.id === member.id ? updated : m)));
    } catch {
      showToast('Failed to update member', 'error');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    try {
      const created = await api.addMember({ name, role: newMemberRole.trim() || 'Engineer' });
      setTeam(prev => [...prev, created]);
      setNewMemberName('');
      setNewMemberRole('');
      showToast(`Added ${created.name} to team`, 'success');
    } catch {
      showToast('Failed to add member', 'error');
    }
  };

  const handleRemoveMember = async (id) => {
    if (team.length <= 1) return;
    try {
      await api.deleteMember(id);
      await refreshAll();
      showToast('Removed member and reassigned tasks', 'info');
    } catch {
      showToast('Failed to remove member', 'error');
    }
  };

  const sortedBacklog = useMemo(() => {
    const statusOrder = { in_progress: 1, in_review: 2, todo: 3, backlog: 4, done: 5 };
    return filteredTasks.slice().sort((a, b) => {
      if (backlogSort === 'priority') return PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight;
      if (backlogSort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      if (backlogSort === 'status') return (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
      if (backlogSort === 'points') return Number(b.points || 0) - Number(a.points || 0);
      return 0;
    });
  }, [filteredTasks, backlogSort]);

  const ongoingTasks = useMemo(
    () => filteredTasks
      .filter(t => t.status === 'in_progress' || t.status === 'in_review')
      .sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight),
    [filteredTasks]
  );

  const upcomingDeadlines = useMemo(
    () => filteredTasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
      .slice(0, 6),
    [filteredTasks]
  );

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div
        className="min-h-screen relative overflow-x-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif' }}
      >
        {/* Ambient Mesh Wallpaper */}
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#eef3fb] dark:bg-[#050814] transition-colors duration-500">
          <div className="lg-orb-a absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-sky-300/45 dark:bg-blue-600/25 blur-[110px]" />
          <div className="lg-orb-b absolute top-16 right-[-80px] w-[480px] h-[480px] rounded-full bg-violet-300/40 dark:bg-indigo-600/25 blur-[120px]" />
          <div className="lg-orb-c absolute bottom-[-120px] left-1/3 w-[540px] h-[420px] rounded-full bg-teal-200/45 dark:bg-cyan-500/15 blur-[120px]" />
          <div className="lg-orb-d absolute top-1/2 -left-20 w-[340px] h-[340px] rounded-full bg-rose-200/35 dark:bg-fuchsia-600/15 blur-[110px]" />
        </div>

        {/* Floating Liquid Glass Header */}
        <div className="sticky top-0 z-30 pt-3 px-4 sm:px-6">
          <header className={`lg-enter max-w-[1440px] mx-auto rounded-full px-4 sm:px-5 h-16 flex items-center justify-between gap-3 ${GLASS_PANEL}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-[0_6px_20px_-4px_rgba(37,99,235,0.55),inset_0_1px_1px_rgba(255,255,255,0.6)] shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold tracking-tight truncate">SprintFlow</h1>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30">
                    <Database className="w-3 h-3" /> SQLite Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate hidden md:block">
                  Liquid Glass Bento Dashboard, Kanban &amp; Backlog
                </p>
              </div>
            </div>

            <nav aria-label="Main views" className="flex items-center bg-slate-900/[0.05] dark:bg-white/[0.06] p-1 rounded-full border border-white/60 dark:border-white/10">
              {[
                { id: 'bento', label: 'Bento', icon: LayoutGrid },
                { id: 'kanban', label: 'Kanban', icon: Kanban },
                { id: 'backlog', label: 'Backlog & Schedule', short: 'Backlog', icon: ListChecks }
              ].map(tab => {
                const Icon = tab.icon;
                const active = activeView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveView(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm transition-all duration-200 ${
                      active
                        ? 'font-semibold bg-white/90 dark:bg-white/20 text-blue-600 dark:text-white shadow-sm'
                        : 'font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.short ? (
                      <>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.short}</span>
                      </>
                    ) : (
                      <span>{tab.label}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTeamModalOpen(true)}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium ${GLASS_PILL}`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Team</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen(o => !o)}
                  aria-label="Data options"
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${GLASS_PILL}`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className={`lg-dropdown absolute right-0 mt-2.5 w-52 rounded-3xl py-2 z-40 ${GLASS_PANEL}`}>
                    <button type="button" onClick={() => { setMenuOpen(false); setTeamModalOpen(true); }} className="sm:hidden w-full px-4 py-2 text-left text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 flex items-center gap-2.5">
                      <Users className="w-3.5 h-3.5" /> Manage Team
                    </button>
                    <button type="button" onClick={handleExportJson} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 flex items-center gap-2.5">
                      <Download className="w-3.5 h-3.5" /> Export JSON
                    </button>
                    <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 flex items-center gap-2.5">
                      <Upload className="w-3.5 h-3.5" /> Import JSON
                    </button>
                    <div className="my-1.5 mx-3 border-t border-slate-900/10 dark:border-white/10" />
                    <button type="button" onClick={handleResetDemo} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-rose-500/10 flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                      <RotateCcw className="w-3.5 h-3.5" /> Reset SQLite Data
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </div>

              <button type="button" onClick={() => setDarkMode(d => !d)} aria-label="Toggle dark mode" className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${GLASS_PILL}`}>
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setTaskModal({ open: true, task: null, defaultStatus: 'todo' })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white shadow-[0_6px_20px_-4px_rgba(0,122,255,0.55),inset_0_1px_0_rgba(255,255,255,0.45)]"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Task</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
          </header>
        </div>

        {apiError && (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-4">
            <div className="rounded-3xl bg-rose-500/15 backdrop-blur-xl border border-rose-400/35 px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-200">
              <span className="flex items-center gap-2 font-medium"><AlertCircle className="w-4 h-4 shrink-0" /> {apiError}</span>
              <button type="button" onClick={refreshAll} className="px-3 py-1 rounded-full bg-rose-600 text-white font-semibold">Retry</button>
            </div>
          </div>
        )}

        {/* Filter Capsule Bar */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-4">
          <div className={`lg-enter lg-delay-1 rounded-[24px] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 ${GLASS_PANEL}`}>
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
              <select value={sprintFilter} onChange={e => setSprintFilter(e.target.value)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${GLASS_PILL}`}>
                <option value="all" className="text-slate-900">All Sprints &amp; Backlog</option>
                <option value="Sprint 14" className="text-slate-900">Sprint 14 (Active · Nov 23 – Dec 6)</option>
                <option value="Sprint 15" className="text-slate-900">Sprint 15 (Next · Dec 7 – Dec 20)</option>
                <option value="Backlog" className="text-slate-900">Unassigned Backlog</option>
              </select>

              <div className="relative flex-1 max-w-xs min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search tasks, IDs, tags..."
                  className={`w-full pl-9 pr-3.5 py-1.5 rounded-full text-xs placeholder-slate-500 dark:placeholder-slate-400 ${GLASS_PILL}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-900/[0.05] dark:bg-white/[0.06] p-1 rounded-full border border-white/55 dark:border-white/10">
                {['all', 'critical', 'high', 'medium', 'low'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriorityFilter(p)}
                    className={`px-3 py-1 rounded-full text-[11px] capitalize transition-all ${
                      priorityFilter === p
                        ? 'font-semibold bg-white/90 dark:bg-white/20 text-blue-600 dark:text-white shadow-sm'
                        : 'font-medium text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className={`px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer ${GLASS_PILL}`}>
                <option value="all" className="text-slate-900">Who: Everyone</option>
                {team.map(m => <option key={m.id} value={m.id} className="text-slate-900">{m.name}</option>)}
              </select>

              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="px-3 py-1.5 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-300 hover:bg-blue-500/10">
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 pb-10">
          {loading ? (
            <div className="py-24 text-center text-sm text-slate-500">Loading sprint data from SQLite...</div>
          ) : (
            <>
              {activeView === 'bento' && (
                <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-5">
                  <div className="lg-enter lg-delay-1 lg-card-hover lg-sheen md:col-span-6 lg:col-span-5 rounded-[32px] p-6 relative overflow-hidden flex flex-col justify-between bg-gradient-to-br from-[#0a84ff]/85 via-[#4f46e5]/80 to-[#7c3aed]/80 dark:from-[#0a84ff]/45 dark:via-[#4f46e5]/45 dark:to-[#6d28d9]/45 backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/20 text-white shadow-[0_20px_50px_-15px_rgba(37,99,235,0.45),inset_0_1px_1px_rgba(255,255,255,0.65)]">
                    <div className="relative z-10">
                      <div className="flex items-center justify-between gap-2 mb-3.5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/20 backdrop-blur-md border border-white/35">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                          {sprintHeader.badge}
                        </span>
                        <span className="text-xs font-medium text-white/85">{sprintHeader.dates}</span>
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight mb-1">{sprintHeader.title}</h2>
                      <p className="text-xs text-white/80 mb-5">{sprintHeader.sub}</p>

                      <div className="space-y-2.5 mb-5">
                        <div className="flex items-end justify-between">
                          <div>
                            <span className="text-4xl font-bold tracking-tight">{kpis.pct}%</span>
                            <span className="text-xs text-white/80 ml-1.5">completed</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold">{kpis.donePts} / {kpis.totalPts} pts</span>
                            <p className="text-[11px] text-white/75">{kpis.doneTasks} of {kpis.totalTasks} tasks done</p>
                          </div>
                        </div>
                        <div className="w-full h-3 rounded-full bg-black/15 p-0.5 border border-white/20 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-white/95 via-sky-100 to-emerald-200 transition-all duration-500" style={{ width: `${kpis.pct}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-4 gap-2 pt-3 border-t border-white/20">
                      {[
                        { label: 'Ongoing', val: kpis.ongoing },
                        { label: 'Review', val: kpis.review },
                        { label: 'Backlog', val: kpis.backlog },
                        { label: 'Critical', val: kpis.criticalOpen, highlight: true }
                      ].map(kpi => (
                        <div key={kpi.label} className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 px-3 py-2">
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${kpi.highlight ? 'text-rose-100' : 'text-white/75'}`}>{kpi.label}</p>
                          <p className="text-lg font-bold mt-0.5">{kpi.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-2 lg-card-hover md:col-span-3 lg:col-span-3 rounded-[32px] p-5 flex flex-col justify-between ${GLASS_PANEL}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">Priority Mix</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">Tap to filter Kanban</p>
                      </div>
                      <span className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-600 dark:text-amber-300 flex items-center justify-center">
                        <Flag className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={priorityData.some(d => d.value > 0) ? priorityData : [{ name: 'Empty', value: 1, color: '#cbd5e1' }]} dataKey="value" nameKey="name" innerRadius={44} outerRadius={66} paddingAngle={4} strokeWidth={0}>
                            {(priorityData.some(d => d.value > 0) ? priorityData : [{ color: '#cbd5e1' }]).map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {priorityData.map(item => (
                        <button key={item.key} type="button" onClick={() => { setPriorityFilter(item.key); setActiveView('kanban'); }} className={`flex items-center justify-between px-3 py-1.5 rounded-full text-left ${GLASS_SUBCARD}`}>
                          <span className="flex items-center gap-1.5 text-[11px] font-medium">
                            <span className={`w-2 h-2 rounded-full ${PRIORITY_META[item.key].dot}`} />
                            {item.name}
                          </span>
                          <span className="text-xs font-bold">{item.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-3 lg-card-hover md:col-span-3 lg:col-span-4 rounded-[32px] p-5 flex flex-col justify-between ${GLASS_PANEL}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">Sprint Burndown</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">Ideal vs. remaining story points</p>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold border ${burndownOnTrack ? 'bg-emerald-500/15 text-emerald-700 border-emerald-400/30 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-800 border-amber-400/30 dark:text-amber-300'}`}>
                        {burndownOnTrack ? 'On Track' : 'Slightly Behind'}
                      </span>
                    </div>
                    <div className="h-48 w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={burndownData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                          <defs>
                            <linearGradient id="burnGradLive" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0a84ff" stopOpacity={0.32} />
                              <stop offset="95%" stopColor="#0a84ff" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'} vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: darkMode ? '#94a3b8' : '#475569' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: darkMode ? '#94a3b8' : '#475569' }} axisLine={false} tickLine={false} />
                          <RechartsTooltip />
                          <Line type="monotone" dataKey="ideal" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={1.5} name="Ideal" />
                          <Area type="monotone" dataKey="remaining" stroke="#0a84ff" fill="url(#burnGradLive)" strokeWidth={2.5} dot={{ r: 3.5, fill: '#0a84ff' }} connectNulls={false} name="Remaining Pts" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-4 lg-card-hover md:col-span-6 lg:col-span-7 rounded-[32px] p-5 flex flex-col ${GLASS_PANEL}`}>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">Who Is Doing What</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">Live team allocation, active focus &amp; next deadline</p>
                      </div>
                      <button type="button" onClick={() => setTeamModalOpen(true)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        <UserCog className="w-3.5 h-3.5" /> Rename Team
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                      {team.map(member => {
                        const mTasks = filteredTasks.filter(t => t.assigneeId === member.id);
                        const active = mTasks.filter(t => t.status === 'in_progress' || t.status === 'in_review');
                        const open = mTasks.filter(t => t.status !== 'done');
                        const pts = open.reduce((s, t) => s + Number(t.points || 0), 0);
                        const loadPct = Math.min(100, Math.round((pts / 13) * 100));
                        const nextDue = open.slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))[0];
                        const focus = active[0] || nextDue;

                        return (
                          <div key={member.id} onClick={() => { setAssigneeFilter(member.id); setActiveView('kanban'); }} className={`cursor-pointer group rounded-[22px] p-3.5 flex flex-col justify-between gap-2.5 ${GLASS_SUBCARD}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-9 h-9 rounded-full ${member.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{getInitials(member.name)}</div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-300">{member.name}</p>
                                  <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">{member.role || 'Team'}</p>
                                </div>
                              </div>
                              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/70 dark:bg-white/10 border border-white/80 dark:border-white/15 shrink-0">{pts} pts</span>
                            </div>
                            <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                              {focus ? <><span className="font-semibold text-slate-900 dark:text-white">{focus.id}:</span> {focus.title}</> : <span className="text-slate-400 italic">No active tasks in this view</span>}
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400">
                                <span>{active.length} ongoing · {open.length} open</span>
                                <span>{nextDue ? `Next: ${formatShortDate(nextDue.dueDate)}` : 'Clear'}</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-slate-900/10 dark:bg-white/10 overflow-hidden">
                                <div className={`h-full rounded-full ${loadPct >= 85 ? 'bg-rose-500' : loadPct >= 55 ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${loadPct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-5 lg-card-hover md:col-span-6 lg:col-span-5 rounded-[32px] p-5 flex flex-col ${GLASS_PANEL}`}>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">Ongoing Tasks</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">Currently in progress or code review</p>
                      </div>
                      <button type="button" onClick={() => setActiveView('kanban')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        Open Kanban <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2.5 overflow-y-auto max-h-[320px] pr-1">
                      {ongoingTasks.length === 0 ? (
                        <div className="py-10 text-center text-xs text-slate-400">No ongoing tasks match current filters.</div>
                      ) : ongoingTasks.map(t => {
                        const m = getMember(t.assigneeId);
                        const p = PRIORITY_META[t.priority];
                        const due = getDueMeta(t.dueDate, t.status);
                        return (
                          <div key={t.id} onClick={() => setTaskModal({ open: true, task: t, defaultStatus: t.status })} className={`cursor-pointer p-3.5 rounded-[22px] ${GLASS_SUBCARD}`}>
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t.id}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${t.status === 'in_review' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'}`}>
                                    {t.status === 'in_review' ? 'In Review' : 'In Progress'}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold truncate">{t.title}</p>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${p.pill}`}>{p.label}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mt-2">
                              <span className="flex items-center gap-1.5">
                                <span className={`w-5 h-5 rounded-full ${m.color} text-white text-[9px] font-bold inline-flex items-center justify-center`}>{getInitials(m.name)}</span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">{m.name}</span>
                              </span>
                              <span className={due.cls}>{due.text}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-6 lg-card-hover md:col-span-3 lg:col-span-6 rounded-[32px] p-5 flex flex-col ${GLASS_PANEL}`}>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">Delivery Schedule (When)</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">Chronological upcoming deadlines</p>
                      </div>
                      <span className="w-9 h-9 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-600 dark:text-sky-300 flex items-center justify-center">
                        <CalendarClock className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="space-y-2 overflow-y-auto max-h-[260px] pr-1">
                      {upcomingDeadlines.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">All tasks in this view are completed.</div>
                      ) : upcomingDeadlines.map(t => {
                        const m = getMember(t.assigneeId);
                        const p = PRIORITY_META[t.priority];
                        const due = getDueMeta(t.dueDate, t.status);
                        const [mon, day] = formatShortDate(t.dueDate).split(' ');
                        return (
                          <div key={t.id} onClick={() => setTaskModal({ open: true, task: t, defaultStatus: t.status })} className="cursor-pointer flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/60 dark:hover:bg-white/[0.08] transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 text-center py-1 rounded-2xl bg-white/70 dark:bg-white/10 border border-white/80 dark:border-white/15 shrink-0">
                                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{mon}</p>
                                <p className="text-xs font-extrabold">{day || '--'}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{t.title}</p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{m.name} · {t.tag} · <span className={due.cls}>{due.text}</span></p>
                              </div>
                            </div>
                            <span className={`w-2.5 h-2.5 rounded-full ${p.dot} shrink-0`} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-6 lg-card-hover md:col-span-3 lg:col-span-6 rounded-[32px] p-5 flex flex-col ${GLASS_PANEL}`}>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">Priority Backlog</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">Queued work ready to pull into active sprint</p>
                      </div>
                      <button type="button" onClick={() => setActiveView('backlog')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        Full Backlog <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2.5 overflow-y-auto max-h-[260px] pr-1">
                      {allBacklogTasks.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">Backlog is empty.</div>
                      ) : allBacklogTasks.slice(0, 5).map(t => {
                        const m = getMember(t.assigneeId);
                        const p = PRIORITY_META[t.priority];
                        return (
                          <div key={t.id} className={`flex items-center justify-between gap-2.5 p-3 rounded-[22px] ${GLASS_SUBCARD}`}>
                            <div onClick={() => setTaskModal({ open: true, task: t, defaultStatus: t.status })} className="cursor-pointer min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${p.pill}`}>{p.label}</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{t.id} · {t.points} pts</span>
                              </div>
                              <p className="text-xs font-semibold truncate">{t.title}</p>
                              <p className="text-[10px] text-slate-600 dark:text-slate-400">{m.name} · Target {formatShortDate(t.dueDate)}</p>
                            </div>
                            <button type="button" onClick={() => promoteTask(t.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold hover:text-blue-600 ${GLASS_PILL}`}>
                              Pull to Sprint
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'kanban' && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Sprint Kanban Board</h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Drag cards between frosted columns — changes persist to SQLite</p>
                    </div>
                    <span className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${GLASS_PILL}`}>
                      {filteredTasks.length} tasks · {kpis.totalPts} story pts
                    </span>
                  </div>

                  <div className="lg-enter grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
                    {STATUS_COLUMNS.map((col, colIdx) => {
                      const colTasks = filteredTasks
                        .filter(t => t.status === col.id)
                        .sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight);
                      const colPts = colTasks.reduce((s, t) => s + Number(t.points || 0), 0);

                      return (
                        <div
                          key={col.id}
                          onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
                          onDragLeave={() => setDragOverCol(null)}
                          onDrop={e => {
                            e.preventDefault();
                            const id = draggedTaskId || e.dataTransfer.getData('text/plain');
                            setDragOverCol(null);
                            setDraggedTaskId(null);
                            if (id) moveTaskStatus(id, col.id);
                          }}
                          style={{ animationDelay: `${colIdx * 60}ms` }} className={`lg-enter rounded-[28px] p-3.5 flex flex-col gap-3 min-h-[280px] transition-all duration-300 backdrop-blur-2xl backdrop-saturate-150 ${
                            dragOverCol === col.id
                              ? 'bg-blue-500/15 border-2 border-blue-500/60'
                              : 'bg-white/40 dark:bg-white/[0.04] border border-white/65 dark:border-white/[0.10]'
                          }`}
                        >
                          <div className="flex items-center justify-between px-1.5 pt-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                              <h3 className="text-xs font-semibold uppercase tracking-wider">{col.label}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badge}`}>{colTasks.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{colPts} pts</span>
                              <button type="button" onClick={() => setTaskModal({ open: true, task: null, defaultStatus: col.id })} className="w-6 h-6 rounded-full hover:bg-white/80 dark:hover:bg-white/15 flex items-center justify-center">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2.5 flex-1">
                            {colTasks.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-400/40 dark:border-white/15 py-8 px-3 text-center text-[11px] text-slate-500">Drop task here</div>
                            ) : colTasks.map(t => {
                              const m = getMember(t.assigneeId);
                              const p = PRIORITY_META[t.priority];
                              const due = getDueMeta(t.dueDate, t.status);
                              return (
                                <div
                                  key={t.id}
                                  draggable
                                  onDragStart={e => { setDraggedTaskId(t.id); e.dataTransfer.setData('text/plain', t.id); }}
                                  onDragEnd={() => { setDraggedTaskId(null); setDragOverCol(null); }}
                                  className={`group rounded-[22px] p-3.5 bg-white/70 dark:bg-white/[0.08] backdrop-blur-xl border border-white/85 dark:border-white/[0.14] shadow-sm hover:-translate-y-0.5 cursor-grab active:cursor-grabbing transition-all ${draggedTaskId === t.id ? 'opacity-45 scale-95' : ''}`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[10px] font-bold text-slate-500">{t.id}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${p.pill}`}>{p.label}</span>
                                  </div>
                                  <h4 onClick={() => setTaskModal({ open: true, task: t, defaultStatus: t.status })} className="cursor-pointer text-xs font-semibold leading-snug mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-300">
                                    {t.title}
                                  </h4>
                                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10">{t.tag}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10">{t.points} pts</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-900/[0.07] dark:border-white/10">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`w-5 h-5 rounded-full ${m.color} text-white text-[9px] font-bold flex items-center justify-center shrink-0`}>{getInitials(m.name)}</span>
                                      <span className="text-[11px] font-medium truncate">{m.name}</span>
                                    </div>
                                    <span className={`text-[10px] shrink-0 ${due.cls}`}>{due.text}</span>
                                  </div>
                                  <div className="mt-2.5">
                                    <select value={t.status} onChange={e => moveTaskStatus(t.id, e.target.value)} className="w-full text-[10px] font-medium px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/80 dark:border-white/15">
                                      {STATUS_COLUMNS.map(s => <option key={s.id} value={s.id} className="text-slate-900">Move to: {s.label}</option>)}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeView === 'backlog' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Backlog &amp; Team Schedule</h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Management overview of who owns what, when it is due, priority, and sprint status</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="backlog-sort" className="text-xs font-medium text-slate-600 dark:text-slate-400">Sort by:</label>
                      <select id="backlog-sort" value={backlogSort} onChange={e => setBacklogSort(e.target.value)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${GLASS_PILL}`}>
                        <option value="priority" className="text-slate-900">Priority (Highest first)</option>
                        <option value="due" className="text-slate-900">Due Date (Soonest first)</option>
                        <option value="status" className="text-slate-900">Status Workflow</option>
                        <option value="points" className="text-slate-900">Story Points</option>
                      </select>
                    </div>
                  </div>

                  <div className={`lg-enter lg-delay-1 rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[760px]">
                        <thead>
                          <tr className="border-b border-slate-900/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            <th className="py-3.5 px-5">Task (What)</th>
                            <th className="py-3.5 px-3">Assignee (Who)</th>
                            <th className="py-3.5 px-3">Due Date (When)</th>
                            <th className="py-3.5 px-3">Priority</th>
                            <th className="py-3.5 px-3">Status</th>
                            <th className="py-3.5 px-3">Sprint / Pts</th>
                            <th className="py-3.5 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.07] text-xs">
                          {sortedBacklog.length === 0 ? (
                            <tr><td colSpan={7} className="py-12 text-center text-slate-400">No tasks match your current filters.</td></tr>
                          ) : sortedBacklog.map(t => {
                            const m = getMember(t.assigneeId);
                            const p = PRIORITY_META[t.priority];
                            const due = getDueMeta(t.dueDate, t.status);
                            const col = STATUS_COLUMNS.find(c => c.id === t.status) || STATUS_COLUMNS[0];
                            return (
                              <tr key={t.id} className="hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors">
                                <td className="py-3.5 px-5 max-w-xs">
                                  <div onClick={() => setTaskModal({ open: true, task: t, defaultStatus: t.status })} className="cursor-pointer group">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[10px] font-bold text-slate-500">{t.id}</span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10">{t.tag}</span>
                                    </div>
                                    <p className="font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-300 truncate">{t.title}</p>
                                  </div>
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-6 h-6 rounded-full ${m.color} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>{getInitials(m.name)}</span>
                                    <span className="font-medium">{m.name}</span>
                                  </div>
                                </td>
                                <td className={`py-3.5 px-3 whitespace-nowrap ${due.cls}`}>{due.text}</td>
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${p.pill}`}>{p.label}</span>
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <select value={t.status} onChange={e => moveTaskStatus(t.id, e.target.value)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${col.badge} cursor-pointer`}>
                                    {STATUS_COLUMNS.map(s => <option key={s.id} value={s.id} className="text-slate-900">{s.label}</option>)}
                                  </select>
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <span className="font-semibold">{t.sprint}</span>
                                  <span className="text-slate-500 dark:text-slate-400 ml-1">· {t.points} pts</span>
                                </td>
                                <td className="py-3.5 px-5 whitespace-nowrap text-right">
                                  <div className="inline-flex items-center gap-1.5">
                                    {t.status === 'backlog' && (
                                      <button type="button" onClick={() => promoteTask(t.id)} className="px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">
                                        Pull to Sprint
                                      </button>
                                    )}
                                    <button type="button" onClick={() => setTaskModal({ open: true, task: t, defaultStatus: t.status })} className={`px-3 py-1 rounded-full text-[11px] font-semibold ${GLASS_PILL}`}>
                                      Edit
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {taskModal.open && (
          <TaskModal
            task={taskModal.task}
            defaultStatus={taskModal.defaultStatus}
            defaultSprint={sprintFilter === 'all' ? 'Sprint 14' : sprintFilter}
            team={team}
            onClose={() => setTaskModal({ open: false, task: null, defaultStatus: 'todo' })}
            onSave={saveTask}
            onDelete={deleteTask}
          />
        )}

        {teamModalOpen && (
          <div onClick={() => setTeamModalOpen(false)} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
            <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-md rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
              <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Manage Team Members</h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Edits save directly to SQLite on blur</p>
                </div>
                <button type="button" onClick={() => setTeamModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {team.map(m => (
                    <div key={m.id} className={`flex items-center gap-2 p-2 rounded-2xl ${GLASS_SUBCARD}`}>
                      <span className={`w-8 h-8 rounded-full ${m.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{getInitials(m.name)}</span>
                      <input type="text" value={m.name} onChange={e => setTeam(prev => prev.map(x => (x.id === m.id ? { ...x, name: e.target.value } : x)))} onBlur={() => handleUpdateMember(m)} className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
                      <input type="text" value={m.role || ''} placeholder="Role" onChange={e => setTeam(prev => prev.map(x => (x.id === m.id ? { ...x, role: e.target.value } : x)))} onBlur={() => handleUpdateMember(m)} className="w-24 px-2 py-1.5 rounded-xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
                      {team.length > 1 && (
                        <button type="button" onClick={() => handleRemoveMember(m.id)} className="p-1.5 rounded-full text-slate-500 hover:text-rose-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddMember} className="flex gap-2 pt-3 border-t border-slate-900/10 dark:border-white/10">
                  <input type="text" required value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Add team member..." className={`flex-1 px-3.5 py-2 rounded-full text-xs ${GLASS_PILL}`} />
                  <input type="text" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} placeholder="Role" className={`w-24 px-3 py-2 rounded-full text-xs ${GLASS_PILL}`} />
                  <button type="submit" className="px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white">Add</button>
                </form>
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`lg-toast px-4 py-2.5 rounded-full text-xs font-semibold backdrop-blur-2xl shadow-xl border flex items-center gap-2 ${t.type === 'success' ? 'bg-emerald-500/85 border-emerald-300/50 text-white' : t.type === 'error' ? 'bg-rose-500/85 border-rose-300/50 text-white' : 'bg-slate-900/80 border-white/20 text-white'}`}>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, defaultStatus, defaultSprint, team, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(task ? task.title : '');
  const [description, setDescription] = useState(task ? task.description || '' : '');
  const [assigneeId, setAssigneeId] = useState(task ? task.assigneeId : (team[0] ? team[0].id : ''));
  const [dueDate, setDueDate] = useState(task ? task.dueDate : '2026-12-02');
  const [status, setStatus] = useState(task ? task.status : defaultStatus);
  const [priority, setPriority] = useState(task ? task.priority : 'medium');
  const [sprint, setSprint] = useState(task ? task.sprint : (defaultStatus === 'backlog' ? 'Sprint 15' : defaultSprint));
  const [points, setPoints] = useState(task ? Number(task.points || 3) : 3);
  const [tag, setTag] = useState(task ? task.tag : 'Frontend');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: task ? task.id : null,
      title: title.trim(),
      description: description.trim(),
      assigneeId,
      dueDate,
      status,
      priority,
      sprint,
      points: Number(points) || 3,
      tag
    });
  };

  return (
    <div onClick={onClose} className="lg-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md">
      <div onClick={e => e.stopPropagation()} className={`lg-modal-panel w-full max-w-lg rounded-[32px] overflow-hidden ${GLASS_PANEL}`}>
        <div className="px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30">{task ? task.id : 'NEW'}</span>
            <h3 className="text-base font-semibold">{task ? 'Edit Sprint Task' : 'Create Sprint Task'}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold mb-1">Task Title (What) *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl text-sm bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Assignee (Who)</label>
              <select value={assigneeId || ''} onChange={e => setAssigneeId(e.target.value)} className="w-full px-3 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15">
                {team.map(m => <option key={m.id} value={m.id} className="text-slate-900">{m.name} ({m.role || 'Team'})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Due Date (When) *</label>
              <input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-2.5 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15">
                {STATUS_COLUMNS.map(s => <option key={s.id} value={s.id} className="text-slate-900">{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full px-2.5 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15">
                <option value="critical" className="text-slate-900">Critical</option>
                <option value="high" className="text-slate-900">High</option>
                <option value="medium" className="text-slate-900">Medium</option>
                <option value="low" className="text-slate-900">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Sprint</label>
              <select value={sprint} onChange={e => setSprint(e.target.value)} className="w-full px-2.5 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15">
                <option value="Sprint 14" className="text-slate-900">Sprint 14</option>
                <option value="Sprint 15" className="text-slate-900">Sprint 15</option>
                <option value="Backlog" className="text-slate-900">Backlog</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Story Pts</label>
              <select value={points} onChange={e => setPoints(Number(e.target.value))} className="w-full px-2.5 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15">
                {[1, 2, 3, 5, 8, 13].map(pt => <option key={pt} value={pt} className="text-slate-900">{pt} {pt === 1 ? 'pt' : 'pts'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Workstream / Tag</label>
            <select value={tag} onChange={e => setTag(e.target.value)} className="w-full px-3 py-2 rounded-2xl text-xs bg-white/75 dark:bg-white/10 border border-white/80 dark:border-white/15">
              <option value="Frontend" className="text-slate-900">Frontend</option>
              <option value="Backend" className="text-slate-900">Backend</option>
              <option value="API" className="text-slate-900">API &amp; Security</option>
              <option value="DevOps" className="text-slate-900">DevOps &amp; Infra</option>
              <option value="QA" className="text-slate-900">QA &amp; Testing</option>
              <option value="Design" className="text-slate-900">UI/UX Design</option>
            </select>
          </div>
          <div className="pt-3 border-t border-slate-900/10 dark:border-white/10 flex items-center justify-between gap-2">
            {task ? (
              <button type="button" onClick={() => onDelete(task.id)} className="px-4 py-2 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-500/10">Delete Task</button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={`px-4 py-2 rounded-full text-xs font-semibold ${GLASS_PILL}`}>Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white">Save Task</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
