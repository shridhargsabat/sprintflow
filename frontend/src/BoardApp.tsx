import { Suspense, lazy, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { PRIORITY_META } from './constants';
import { useBoard } from './hooks/useBoard';
import { useHashRoute } from './hooks/useHashRoute';
import { TaskModal } from './components/TaskModal';
import { TaskDetailsModal } from './components/TaskDetailsModal';
import { TeamModal } from './components/TeamModal';
import { UsersModal } from './components/UsersModal';
import { TagsModal } from './components/TagsModal';
import { SprintSettingsModal } from './components/SprintSettingsModal';
import { PointsScaleModal } from './components/PointsScaleModal';
import { Toasts } from './components/Toasts';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import DashboardView from './views/DashboardView';
const KanbanView = lazy(() => import('./views/KanbanView'));
const BacklogView = lazy(() => import('./views/BacklogView'));
const ReportsView = lazy(() => import('./views/ReportsView'));
import type { PriorityFilter, Task, TaskModalState, TaskStatus } from './types';

export default function BoardApp() {
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Hash-routed: refresh/deep-link preserves the view; nav clicks push
  // history entries so back/forward walks views. Unknown hash -> dashboard.
  const [activeView, setActiveView] = useHashRoute();
  const [sprintFilter, setSprintFilter] = useState<string>('Sprint 14');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [taskModal, setTaskModal] = useState<TaskModalState>({ open: false, task: null, defaultStatus: 'todo' });
  const [detailsModal, setDetailsModal] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [teamModalOpen, setTeamModalOpen] = useState<boolean>(false);
  const [usersModalOpen, setUsersModalOpen] = useState<boolean>(false);
  const [tagsModalOpen, setTagsModalOpen] = useState<boolean>(false);
  const [sprintSettingsOpen, setSprintSettingsOpen] = useState<boolean>(false);
  const [pointsScaleOpen, setPointsScaleOpen] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberRole, setNewMemberRole] = useState<string>('');

  const board = useBoard({
    setTaskModal,
    clearFilters: () => clearFilters(),
    newMemberName,
    newMemberRole,
    setNewMemberName,
    setNewMemberRole
  });

  // Default sprint filter follows the lifecycle-active sprint (falling back
  // to the first open sprint, then the first sprint); the 'Sprint 14'
  // literal below is only the pre-load/initial id.
  const activeSprint = useMemo(
    () =>
      board.sprints.find(s => s.status === 'active') ??
      board.sprints.find(s => s.status !== 'closed') ??
      board.sprints[0] ??
      null,
    [board.sprints]
  );
  const defaultSprintFilter = activeSprint ? activeSprint.id : 'Sprint 14';

  const clearFilters = (): void => {
    setSprintFilter(defaultSprintFilter);
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setTagFilter([]);
    setSearchQuery('');
  };

  const filteredTasks = useMemo(() => {
    return board.tasks.filter(t => {
      if (sprintFilter !== 'all') {
        if (sprintFilter === 'Backlog') {
          if (t.sprint !== 'Backlog' && t.status !== 'backlog') return false;
        } else {
          // Match by id OR name: tasks store stable ids, but legacy values
          // may hold a pre-rename name — both must keep matching the filter.
          const cfg = board.sprints.find(s => s.id === sprintFilter || s.name === sprintFilter);
          const accepted = cfg ? [cfg.id, cfg.name] : [sprintFilter];
          if (!accepted.includes(t.sprint)) return false;
        }
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all') {
        const assignees = t.assignees ?? [];
        if (assigneeFilter.startsWith('user:')) {
          const uid = assigneeFilter.slice(5);
          if (!assignees.some(a => a.type === 'user' && String(a.id) === uid)) return false;
        } else if (!assignees.some(a => a.type === 'member' && String(a.id) === assigneeFilter)) {
          return false;
        }
      }
      if (tagFilter.length > 0) {
        const names = t.tags ?? [];
        if (!tagFilter.some(f => names.includes(f))) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const who = (t.assignees ?? []).map(a => `${a.name} ${a.email ?? ''}`).join(' ');
        const hay = [t.id, t.title, t.description, (t.tags ?? []).join(' '), who, t.sprint].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [board.tasks, board.sprints, sprintFilter, priorityFilter, assigneeFilter, tagFilter, searchQuery]);

  const allBacklogTasks = useMemo(
    () => board.tasks.filter(t => t.status === 'backlog').sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight),
    [board.tasks]
  );

  const hasActiveFilters = priorityFilter !== 'all' || assigneeFilter !== 'all' || tagFilter.length > 0 || searchQuery.trim() !== '' || sprintFilter !== defaultSprintFilter;

  const openTaskModal = (task: Task | null, defaultStatus: TaskStatus): void => {
    setTaskModal({ open: true, task, defaultStatus });
  };

  const openDetails = (task: Task): void => {
    setDetailsModal({ open: true, task });
  };

  const closeDetails = (): void => {
    setDetailsModal({ open: false, task: null });
  };

  const moveTask = (taskId: string, status: TaskStatus): void => {
    void board.moveTaskStatus(taskId, status);
  };

  const promoteTask = (taskId: string): void => {
    void board.promoteTask(taskId);
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div
        className="min-h-screen relative overflow-x-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter Variable", "Inter", sans-serif' }}
      >
        <Header
          activeView={activeView}
          onSelectView={setActiveView}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(o => !o)}
          onCloseMenu={() => setMenuOpen(false)}
          onOpenTeam={() => setTeamModalOpen(true)}
          onOpenUsers={() => setUsersModalOpen(true)}
          onOpenTags={() => setTagsModalOpen(true)}
          onOpenPointsScale={() => setPointsScaleOpen(true)}
          onNewTask={() => openTaskModal(null, 'todo')}
          onExportJson={() => { board.handleExportJson(); setMenuOpen(false); }}
          onImportJson={(e) => { board.handleImportJson(e); setMenuOpen(false); }}
          fileInputRef={board.fileInputRef}
        />

        {board.apiError && (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-4">
            <div className="rounded-3xl bg-rose-500/15 backdrop-blur-xl border border-rose-400/35 px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-200">
              <span className="flex items-center gap-2 font-medium"><AlertCircle className="w-4 h-4 shrink-0" /> {board.apiError}</span>
              <button type="button" onClick={board.refreshAll} className="px-3 py-1 rounded-full bg-rose-600 text-white font-semibold">Retry</button>
            </div>
          </div>
        )}

        <FilterBar
          sprintFilter={sprintFilter}
          onSprintFilterChange={setSprintFilter}
          sprints={board.sprints}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          team={board.team}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />

        <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 pb-10">
          {board.loading ? (
            <div className="py-24 text-center text-sm text-slate-500">Loading sprint data from SQLite...</div>
          ) : (
            <>
              {activeView === 'dashboard' && (
                <DashboardView
                  tasks={filteredTasks}
                  backlogTasks={allBacklogTasks}
                  team={board.team}
                  sprintFilter={sprintFilter}
                  sprints={board.sprints}
                  activeSprintId={activeSprint ? activeSprint.id : null}
                  darkMode={darkMode}
                  onOpenDetails={(task) => openDetails(task)}
                  onOpenSprintSettings={() => setSprintSettingsOpen(true)}
                  onPromoteTask={promoteTask}
                  onMoveTaskStatus={moveTask}
                  onOpenKanban={(priority) => { if (priority) setPriorityFilter(priority); setActiveView('kanban'); }}
                  onOpenBacklog={() => setActiveView('backlog')}
                  onSelectAssignee={(memberId) => { setAssigneeFilter(memberId); setActiveView('kanban'); }}
                  onOpenTeam={() => setTeamModalOpen(true)}
                />
              )}
              <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">Loading view…</div>}>
              {activeView === 'kanban' && (
                <KanbanView
                  tasks={filteredTasks}
                  team={board.team}
                  onOpenTask={openTaskModal}
                  onOpenDetails={(task) => openDetails(task)}
                  onMoveTaskStatus={moveTask}
                />
              )}
              {activeView === 'backlog' && (
                <BacklogView
                  tasks={filteredTasks}
                  team={board.team}
                  sprints={board.sprints}
                  onOpenTask={openTaskModal}
                  onOpenDetails={(task) => openDetails(task)}
                  onMoveTaskStatus={moveTask}
                  onPromoteTask={promoteTask}
                />
              )}
              {activeView === 'reports' && (
                <ReportsView
                  sprints={board.sprints}
                  defaultSprintId={activeSprint ? activeSprint.id : null}
                />
              )}
              </Suspense>
            </>
          )}
        </main>

        {taskModal.open && (
          <TaskModal
            task={taskModal.task}
            defaultStatus={taskModal.defaultStatus}
            defaultSprint={sprintFilter === 'all' ? defaultSprintFilter : sprintFilter}
            sprints={board.sprints}
            team={board.team}
            pointsScale={board.pointsScale}
            onClose={() => setTaskModal({ open: false, task: null, defaultStatus: 'todo' })}
            onSave={board.saveTask}
            onDelete={board.deleteTask}
          />
        )}

        {detailsModal.open && detailsModal.task && (
          <TaskDetailsModal
            task={detailsModal.task}
            sprints={board.sprints}
            onClose={closeDetails}
            onEdit={() => { const t = detailsModal.task; closeDetails(); if (t) openTaskModal(t, t.status); }}
            onDelete={(id) => { void board.deleteTask(id); closeDetails(); }}
            onPromote={(id) => { promoteTask(id); closeDetails(); }}
          />
        )}

        {teamModalOpen && (
          <TeamModal
            team={board.team}
            tasks={board.tasks}
            newMemberName={newMemberName}
            newMemberRole={newMemberRole}
            onNameChange={setNewMemberName}
            onRoleChange={setNewMemberRole}
            onUpdateMember={board.handleUpdateMember}
            onAddMember={board.handleAddMember}
            onAddMemberFromUser={board.handleAddMemberFromUser}
            onRemoveMember={board.handleRemoveMember}
            onBulkAdd={board.handleBulkAddMembers}
            onRenameMember={(id, patch) => board.setTeam(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)))}
            onClose={() => setTeamModalOpen(false)}
          />
        )}

        {sprintSettingsOpen && (
          <SprintSettingsModal
            sprints={board.sprints}
            tasks={board.tasks}
            onClose={() => setSprintSettingsOpen(false)}
            onSave={(id, patch) => { void board.updateSprint(id, patch); }}
            onCreate={(payload) => { void board.createSprint(payload); }}
            onActivate={(id) => { void board.activateSprint(id); }}
            onCloseSprint={(id, rolloverTo) => { void board.closeSprint(id, rolloverTo); }}
            onRolloverSprint={(id, targetId) => { void board.rolloverSprint(id, targetId); }}
            onNothingToMove={() => board.showToast('Nothing to move', 'info')}
          />
        )}

        {usersModalOpen && (
          <UsersModal onClose={() => setUsersModalOpen(false)} />
        )}

        {tagsModalOpen && (
          <TagsModal onClose={() => setTagsModalOpen(false)} onChanged={board.refreshAll} />
        )}

        {pointsScaleOpen && (
          <PointsScaleModal
            scale={board.pointsScale}
            onClose={() => setPointsScaleOpen(false)}
            onSave={(scale) => { void board.updatePointsScale(scale).then(() => setPointsScaleOpen(false)).catch(() => {}); }}
          />
        )}

        <Toasts toasts={board.toasts} />
      </div>
    </div>
  );
}
