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
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  sprint: string;
  points: number;
  tag: string;
}

export type TaskPayload = Omit<Task, 'id'>;

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export interface TaskModalState {
  open: boolean;
  task: Task | null;
  defaultStatus: TaskStatus;
  defaultSprint: string;
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
