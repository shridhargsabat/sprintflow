export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type ViewId = 'dashboard' | 'kanban' | 'backlog';
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
  tag: string;
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
  tag: string;
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
