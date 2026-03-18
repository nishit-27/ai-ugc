'use client';

import type { TooltipProps } from 'recharts';

type Props = TooltipProps<number, string> & {
  formatLabel?: (label: string) => string;
  formatValue?: (value: number, name: string) => string | number;
  formatName?: (name: string) => string;
  hideZeroValues?: boolean;
};

function defaultFormatValue(value: number): string {
  return value.toLocaleString();
}

export default function LateChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue = defaultFormatValue,
  formatName,
  hideZeroValues = false,
}: Props) {
  if (!active || !payload?.length) return null;

  const items = payload.filter((item) => {
    if (!item || item.value == null) return false;
    if (!hideZeroValues) return true;
    return Number(item.value) !== 0;
  });

  if (!items.length) return null;

  const displayLabel = label == null
    ? ''
    : formatLabel
      ? formatLabel(String(label))
      : String(label);

  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xl dark:border-white/10 dark:bg-[#262626]"
      style={{ opacity: 1 }}
    >
      {displayLabel ? (
        <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">{displayLabel}</div>
      ) : null}
      <div className="space-y-1.5">
        {items.map((item, index) => {
          const name = String(item.name ?? item.dataKey ?? 'Value');
          const formattedName = formatName ? formatName(name) : name;
          const numericValue = Number(item.value);
          const displayValue = formatValue(Number.isFinite(numericValue) ? numericValue : 0, formattedName);
          const dotColor = typeof item.color === 'string'
            ? item.color
            : typeof item.fill === 'string'
              ? item.fill
              : '#71717a';

          return (
            <div key={`${formattedName}-${index}`} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
              <span className="text-zinc-500 dark:text-zinc-400">{formattedName}:</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
