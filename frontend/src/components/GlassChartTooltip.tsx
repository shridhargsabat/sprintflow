import type { ReactElement } from 'react';

interface ChartPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: { color?: string };
}

/**
 * Liquid-glass content renderer for Recharts tooltips. Matches the
 * GlassTooltip pill language (dark frost in light mode, light frost in
 * dark mode) with series color dots and tabular numerals.
 * Usage: <Tooltip content={<GlassChartTooltip />} />
 */
export function GlassChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartPayloadEntry[];
  label?: string;
}): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-2xl px-3 py-2 text-[11px] leading-5 backdrop-blur-xl border shadow-xl bg-slate-900/85 text-white border-white/20 dark:bg-white/90 dark:text-slate-900 dark:border-white/60">
      {label != null && label !== '' && (
        <div className="font-semibold mb-1 tabular-nums opacity-90">{label}</div>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={`${p.dataKey ?? p.name ?? i}`} className="flex items-center gap-1.5 tabular-nums">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: p.color ?? p.payload?.color ?? '#0a84ff' }}
            />
            <span className="opacity-75 font-medium">{p.name}</span>
            <span className="font-bold ml-auto pl-3">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GlassChartTooltip;
