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

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeUserId?: number | null;
  assignedUser?: { name: string; email: string } | null;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  sprint: string;
  points: number;
  tag: string;
}

export type TaskPayload = Omit<Task, 'id'>;

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

export interface SprintConfig {
  id: string;
  name: string;
  startDate: string;
  lengthDays: number;
  endDate: string;
}

export interface SprintPatch {
  startDate?: string;
  lengthDays?: number;
}
