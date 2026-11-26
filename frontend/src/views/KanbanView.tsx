import { useState } from 'react';
import { Plus } from 'lucide-react';
import Dropdown from '../components/Dropdown';
import GlassTooltip from '../components/GlassTooltip';
import AssigneeCluster, { assigneeNames } from '../components/AssigneeCluster';
import type { Task, TaskStatus, TeamMember } from '../types';
import { GLASS_PILL, PRIORITY_META, STATUS_COLUMNS } from '../constants';
import { getDueMeta } from '../utils/format';

interface KanbanViewProps {
  tasks: Task[];
  team: TeamMember[];
  onOpenTask: (task: Task | null, defaultStatus: TaskStatus) => void;
  onOpenDetails: (task: Task) => void;
  onMoveTaskStatus: (taskId: string, status: TaskStatus) => void;
}

export default function KanbanView({ tasks, onOpenTask, onOpenDetails, onMoveTaskStatus }: KanbanViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const totalPts = tasks.reduce((s, t) => s + Number(t.points || 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sprint Kanban Board</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Drag cards between frosted columns — changes persist to SQLite</p>
        </div>
        <span className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${GLASS_PILL}`}>
          {tasks.length} tasks · {totalPts} story pts
        </span>
      </div>

      <div className="lg-enter grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
        {STATUS_COLUMNS.map((col, colIdx) => {
          const colTasks = tasks
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
                if (id) onMoveTaskStatus(id, col.id);
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
                  <GlassTooltip label={`${colTasks.length} tasks in column`}>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badge}`}>{colTasks.length}</span>
                  </GlassTooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <GlassTooltip label={`${colPts} story points`}>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{colPts} pts</span>
                  </GlassTooltip>
                  <GlassTooltip label={`Add ${col.label} task`}>
                    <button type="button" onClick={() => onOpenTask(null, col.id)} className="w-6 h-6 rounded-full hover:bg-white/80 dark:hover:bg-white/15 flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </GlassTooltip>
                </div>
              </div>

              <div className="space-y-2.5 flex-1">
                {colTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-400/40 dark:border-white/15 py-8 px-3 text-center text-[11px] text-slate-500">Drop task here</div>
                ) : colTasks.map(t => {
                  const p = PRIORITY_META[t.priority];
                  const due = getDueMeta(t.dueDate, t.status);
                  const names = assigneeNames(t.assignees);
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
                      <h4 onClick={() => onOpenDetails(t)} className="cursor-pointer text-xs font-semibold leading-snug mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-300">
                        {t.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10">{t.tag}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10">{t.points} pts</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-900/[0.07] dark:border-white/10">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AssigneeCluster assignees={t.assignees} size="xs" />
                          {names !== '' && <span className="text-[11px] font-medium truncate">{names}</span>}
                        </div>
                        <span className={`text-[10px] shrink-0 ${due.cls}`}>{due.text}</span>
                      </div>
                      <div className="mt-2.5">
                        <Dropdown
                          value={t.status}
                          onChange={(v) => onMoveTaskStatus(t.id, v as TaskStatus)}
                          options={STATUS_COLUMNS.map(s => ({ value: s.id, label: `Move to: ${s.label}` }))}
                          className="inline-flex w-full items-center justify-between gap-2 rounded-full px-2.5 py-1 text-[10px] font-medium bg-white/60 dark:bg-white/10 border border-white/80 dark:border-white/15"
                        />
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
  );
}
