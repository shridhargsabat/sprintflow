import { Search } from 'lucide-react';
import Dropdown from './Dropdown';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { formatShortDate } from '../utils/format';
import type { PriorityFilter, SprintConfig, TeamMember } from '../types';

export interface FilterBarProps {
  sprintFilter: string;
  onSprintFilterChange: (value: string) => void;
  sprints: SprintConfig[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  priorityFilter: PriorityFilter;
  onPriorityFilterChange: (value: PriorityFilter) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  team: TeamMember[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export default function FilterBar({
  sprintFilter,
  onSprintFilterChange,
  sprints,
  searchQuery,
  onSearchQueryChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  team,
  hasActiveFilters,
  onClearFilters,
}: FilterBarProps) {
  const sprintOptions = [
    { value: 'all', label: 'All Sprints & Backlog' },
    ...(sprints.length > 0
      ? sprints.map(s => ({ value: s.id, label: `${s.name} (${formatShortDate(s.startDate)} – ${formatShortDate(s.endDate)})` }))
      : [{ value: 'Sprint 14', label: 'Sprint 14' }, { value: 'Sprint 15', label: 'Sprint 15' }]),
    { value: 'Backlog', label: 'Unassigned Backlog' }
  ];
  return (
    <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-4">
      <div className={`lg-enter lg-delay-1 rounded-[24px] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 ${GLASS_PANEL}`}>
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="shrink-0 min-w-44">
            <Dropdown
              value={sprintFilter}
              onChange={onSprintFilterChange}
              options={sprintOptions}
              className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${GLASS_PILL}`}
            />
          </div>

          <div className="relative flex-1 max-w-xs min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              placeholder="Search tasks, IDs, tags..."
              className={`w-full pl-9 pr-3.5 py-1.5 rounded-full text-xs field-text placeholder-slate-500 dark:placeholder-slate-400 ${GLASS_PILL}`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900/[0.05] dark:bg-white/[0.06] p-1 rounded-full border border-white/55 dark:border-white/10">
            {(['all', 'critical', 'high', 'medium', 'low'] as PriorityFilter[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onPriorityFilterChange(p)}
                className={`px-3 py-1 rounded-full text-[11px] capitalize transition-all ${
                  priorityFilter === p
                    ? 'font-semibold bg-white/90 dark:bg-white/20 text-blue-600 dark:text-white shadow-sm'
                    : 'font-medium text-slate-600 dark:text-slate-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="shrink-0 min-w-36">
            <Dropdown
              value={assigneeFilter}
              onChange={onAssigneeFilterChange}
              options={[{ value: 'all', label: 'Who: Everyone' }, ...team.map(m => ({ value: m.id, label: m.name }))]}
              className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium cursor-pointer ${GLASS_PILL}`}
            />
          </div>

          {hasActiveFilters && (
            <button type="button" onClick={onClearFilters} className="px-3 py-1.5 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-300 hover:bg-blue-500/10">
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
