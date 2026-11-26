import { useMemo } from 'react';
import {
  Flag,
  CalendarClock,
  ArrowRight,
  UserCog
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
import type { PriorityFilter, Task, TaskPriority, TaskStatus, TeamMember } from '../types';
import { PRIORITY_META, GLASS_PANEL, GLASS_SUBCARD, GLASS_PILL } from '../constants';
import { getInitials, formatShortDate, getDueMeta } from '../utils/format';

export interface DashboardViewProps {
  tasks: Task[];
  backlogTasks: Task[];
  team: TeamMember[];
  sprintFilter: string;
  darkMode: boolean;
  onOpenTask: (task: Task | null, defaultStatus: TaskStatus) => void;
  onPromoteTask: (taskId: string) => void;
  onMoveTaskStatus: (taskId: string, status: TaskStatus) => void;
  onOpenKanban: (priority?: PriorityFilter) => void;
  onOpenBacklog: () => void;
  onSelectAssignee: (memberId: string) => void;
  onOpenTeam: () => void;
}

export default function DashboardView({
  tasks,
  backlogTasks,
  team,
  sprintFilter,
  darkMode,
  onOpenTask,
  onPromoteTask,
  onOpenKanban,
  onOpenBacklog,
  onSelectAssignee,
  onOpenTeam
}: DashboardViewProps) {
  const getMember = (id: string | null): TeamMember =>
    team.find(m => m.id === id) || { id: 'unassigned', name: 'Unassigned', role: 'Open', color: 'bg-slate-400' };

  const kpis = useMemo(() => {
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const totalPts = tasks.reduce((s, t) => s + Number(t.points || 0), 0);
    const donePts = tasks.filter(t => t.status === 'done').reduce((s, t) => s + Number(t.points || 0), 0);
    const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : (totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0);
    return {
      totalTasks,
      doneTasks,
      totalPts,
      donePts,
      pct,
      ongoing: tasks.filter(t => t.status === 'in_progress').length,
      review: tasks.filter(t => t.status === 'in_review').length,
      backlog: backlogTasks.length,
      criticalOpen: tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length
    };
  }, [tasks, backlogTasks]);

  const priorityData = useMemo(() => {
    return (Object.keys(PRIORITY_META) as TaskPriority[]).map(key => ({
      key,
      name: PRIORITY_META[key].label,
      value: tasks.filter(t => t.priority === key).length,
      color: PRIORITY_META[key].color
    }));
  }, [tasks]);

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

  const ongoingTasks = useMemo(
    () => tasks
      .filter(t => t.status === 'in_progress' || t.status === 'in_review')
      .sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight),
    [tasks]
  );

  const upcomingDeadlines = useMemo(
    () => tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
      .slice(0, 6),
    [tasks]
  );

  return (
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
            <button key={item.key} type="button" onClick={() => onOpenKanban(item.key)} className={`flex items-center justify-between px-3 py-1.5 rounded-full text-left ${GLASS_SUBCARD}`}>
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
          <button type="button" onClick={onOpenTeam} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <UserCog className="w-3.5 h-3.5" /> Rename Team
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          {team.map(member => {
            const mTasks = tasks.filter(t => t.assigneeId === member.id);
            const active = mTasks.filter(t => t.status === 'in_progress' || t.status === 'in_review');
            const open = mTasks.filter(t => t.status !== 'done');
            const pts = open.reduce((s, t) => s + Number(t.points || 0), 0);
            const loadPct = Math.min(100, Math.round((pts / 13) * 100));
            const nextDue = open.slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))[0];
            const focus = active[0] || nextDue;

            return (
              <div key={member.id} onClick={() => onSelectAssignee(member.id)} className={`cursor-pointer group rounded-[22px] p-3.5 flex flex-col justify-between gap-2.5 ${GLASS_SUBCARD}`}>
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
          <button type="button" onClick={() => onOpenKanban()} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
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
              <div key={t.id} onClick={() => onOpenTask(t, t.status)} className={`cursor-pointer p-3.5 rounded-[22px] ${GLASS_SUBCARD}`}>
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
              <div key={t.id} onClick={() => onOpenTask(t, t.status)} className="cursor-pointer flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/60 dark:hover:bg-white/[0.08] transition-colors">
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
          <button type="button" onClick={onOpenBacklog} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            Full Backlog <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-2.5 overflow-y-auto max-h-[260px] pr-1">
          {backlogTasks.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">Backlog is empty.</div>
          ) : backlogTasks.slice(0, 5).map(t => {
            const m = getMember(t.assigneeId);
            const p = PRIORITY_META[t.priority];
            return (
              <div key={t.id} className={`flex items-center justify-between gap-2.5 p-3 rounded-[22px] ${GLASS_SUBCARD}`}>
                <div onClick={() => onOpenTask(t, t.status)} className="cursor-pointer min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${p.pill}`}>{p.label}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{t.id} · {t.points} pts</span>
                  </div>
                  <p className="text-xs font-semibold truncate">{t.title}</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">{m.name} · Target {formatShortDate(t.dueDate)}</p>
                </div>
                <button type="button" onClick={() => onPromoteTask(t.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold hover:text-blue-600 ${GLASS_PILL}`}>
                  Pull to Sprint
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
