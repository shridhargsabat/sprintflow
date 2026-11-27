export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type ViewId = 'dashboard' | 'kanban' | 'backlog' | 'reports';
export type PriorityFilter = 'all' | TaskPriority;
export type ToastType = 'info' | 'success' | 'error';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  color: string;
  userId?: number | null;
  linkedUser?: { name: string; email: string } | null;
}

export type AssigneeType = 'member' | 'user';

export interface TaskAssignee {
  type: AssigneeType;
  id: string | number;
  name: string;
  email?: string;
  role?: string;
  color?: string;
}

export interface AssigneeRef {
  type: AssigneeType;
  id: string | number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignees: TaskAssignee[];
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  sprint: string;
  points: number;
  tags: string[];
  parent: TaskLinkSummary | null;
  subtasks: TaskLinkSummary[];
  related: TaskLinkSummary[];
}

export interface TaskLinkSummary {
  id: string;
  title: string;
  status: TaskStatus;
  points: number;
}

export type TaskLinkKind = 'subtask' | 'related';

export interface TaskLink {
  task_id: string;
  linked_task_id: string;
  kind: TaskLinkKind;
}

export interface BoardLink {
  from: string;
  to: string;
  kind: TaskLinkKind;
}

export interface TaskPayload {
  title: string;
  description: string;
  assignees: AssigneeRef[];
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  sprint: string;
  points: number;
  tags: string[];
}

export type TaskFormValues = TaskPayload & { id: string | null };

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export interface TaskModalState {
  open: boolean;
  task: Task | null;
  defaultStatus: TaskStatus;
}

export interface DashboardSummary {
  sprint: string;
  totalTasks: number;
  doneTasks: number;
  totalPoints: number;
  donePoints: number;
  completionPct: number;
  ongoingCount: number;
  reviewCount: number;
  backlogCount: number;
  criticalOpenCount: number;
}

export interface BoardImport {
  team: TeamMember[];
  tasks: Task[];
  links?: BoardLink[];
}

export type SprintStatus = 'planned' | 'active' | 'closed';

export interface SprintConfig {
  id: string;
  name: string;
  startDate: string;
  lengthDays: number;
  endDate: string;
  status: SprintStatus;
}

export interface SprintPatch {
  name?: string;
  startDate?: string;
  lengthDays?: number;
}

export type TaskActivityAction = 'created' | 'updated' | 'rollover' | 'deleted' | 'link';

export interface TaskActivityEntry {
  id: number;
  taskId: string;
  actorId: number | null;
  actor: string;
  actorEmail: string;
  action: TaskActivityAction;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** One task row inside a sprint report section (current tasks). */
export interface SprintReportTask {
  id: string;
  title: string;
  status: TaskStatus;
  points: number;
  sprint: string;
}

/**
 * One task row inside the movedOut/movedIn sections. status/sprint are null
 * when the task was deleted after moving (the trail outlives the row);
 * from/to are the sprint refs of the latest matching move.
 */
export interface SprintReportMovedTask {
  id: string;
  title: string;
  status: string | null;
  points: number;
  sprint: string | null;
  from: string | null;
  to: string | null;
  movedAt: string | null;
}

export interface SprintReportSection<T> {
  count: number;
  points: number;
  tasks: T[];
}

export interface SprintReport {
  sprint: SprintConfig;
  totals: { tasks: number; points: number };
  completed: SprintReportSection<SprintReportTask>;
  movedOut: SprintReportSection<SprintReportMovedTask>;
  movedIn: SprintReportSection<SprintReportMovedTask>;
  remainingUnfinished: SprintReportSection<SprintReportTask>;
}
