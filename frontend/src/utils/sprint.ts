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

/**
 * Suggest the next available sprint name ('Sprint N').
 *
 * N starts at max(numeric suffix across existing sprint display NAMES
 * matching /Sprint (\d+)/i) + 1, or 1 when no name carries a number.
 * Only names seed N: stable ids are invisible legacy internals (e.g. ids
 * 'Sprint 14'/'Sprint 15' renamed to 'Sprint 1'/'Sprint 2' must suggest
 * 'Sprint 3', not 'Sprint 16'). N then bumps until neither the candidate
 * name ('Sprint N') nor its backend id (slug 'sprint-n') collides with
 * any existing id or name (case-insensitive), so the id space stays safe.
 */
export function suggestNextSprintName(sprints: Array<Pick<SprintConfig, 'id' | 'name'>>): string {
  const SUFFIX_RE = /sprint[\s\-_]*(\d+)\s*$/i;
  let max = 0;
  const taken = new Set<string>();
  for (const s of sprints) {
    taken.add(s.id.toLowerCase());
    taken.add(s.name.toLowerCase());
    // Seed from display names only — ids are invisible legacy internals.
    const m = SUFFIX_RE.exec(s.name.trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  let n = max + 1;
  while (taken.has(`sprint ${n}`) || taken.has(`sprint-${n}`)) {
    n += 1;
  }
  return `Sprint ${n}`;
}
