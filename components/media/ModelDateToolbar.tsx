'use client';

import { useMemo } from 'react';
import RefreshButton from '@/components/ui/RefreshButton';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { DateFilterValue } from '@/types/media-filters';
import { DATE_FILTER_OPTIONS } from '@/types/media-filters';
import type { ModelFilterOption } from '@/hooks/useModelFilterOptions';

export default function ModelDateToolbar({
  modelId,
  onModelChange,
  dateFilter,
  onDateFilterChange,
  modelOptions,
  onRefresh,
  className = '',
}: {
  modelId: string;
  onModelChange: (value: string) => void;
  dateFilter: DateFilterValue;
  onDateFilterChange: (value: DateFilterValue) => void;
  modelOptions: ModelFilterOption[];
  onRefresh: () => Promise<void> | void;
  className?: string;
}) {
  const selectOptions = useMemo(
    () => [
      { value: 'all', label: 'All models' },
      ...modelOptions.map((m) => ({ value: m.id, label: m.name })),
    ],
    [modelOptions],
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <SearchableSelect
        value={modelId}
        onChange={onModelChange}
        options={selectOptions}
        placeholder="All models"
        className="min-w-0 flex-1 sm:min-w-[11rem] sm:flex-none"
      />

      <label className="sr-only" htmlFor="media-date-filter">Filter by date</label>
      <select
        id="media-date-filter"
        value={dateFilter}
        onChange={(e) => onDateFilterChange(e.target.value as DateFilterValue)}
        className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 sm:min-w-[10.5rem] sm:flex-none"
      >
        {DATE_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>

      <RefreshButton onClick={onRefresh} />
    </div>
  );
}
