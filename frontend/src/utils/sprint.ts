import type { SprintConfig } from '../types';

/**
 * Resolve a stored sprint ref (stable id, or a legacy name) to the sprint's
 * CURRENT display name. Id match wins, then name match; unknown refs
 * (including the 'Backlog' pseudo-sprint) fall back to the raw ref so the
 * caller never renders a blank label.
 */
export function resolveSprintName(sprints: SprintConfig[], ref: string): string {
  const byId = sprints.find(s => s.id === ref);
  if (byId) return byId.name;
  const byName = sprints.find(s => s.name === ref);
  if (byName) return byName.name;
  return ref;
}
