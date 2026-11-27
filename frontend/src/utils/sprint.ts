import type { SprintConfig } from '../types';

/**
 * Resolve a task's stored sprint ref to the live sprint name.
 *
 * Tasks store the stable sprint id (e.g. 'Sprint 14'), so after a rename in
 * Sprint Settings the raw ref goes stale. Match the ref against s.id first,
 * then s.name (case-insensitive), and return the live s.name. Falls back to
 * the raw ref when nothing matches (covers the 'Backlog' pseudo-sprint and
 * unknown values).
 */
export function resolveSprintName(sprints: SprintConfig[], ref: string): string {
  const byId = sprints.find((s) => s.id === ref);
  if (byId) return byId.name;
  const lower = ref.toLowerCase();
  const byName = sprints.find((s) => s.name.toLowerCase() === lower);
  if (byName) return byName.name;
  return ref;
}
