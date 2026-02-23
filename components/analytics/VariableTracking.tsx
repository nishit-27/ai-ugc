'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useVariables } from '@/hooks/useVariables';
import PivotFieldList from './pivot/PivotFieldList';
import PivotDropZone from './pivot/PivotDropZone';
import PivotTable from './pivot/PivotTable';
import PivotField, { type PivotFieldData } from './pivot/PivotField';
import { RefreshCw, Filter, X, ChevronDown, Calendar } from 'lucide-react';

const BUILTIN_FIELDS: PivotFieldData[] = [
  { id: 'platform', label: 'Platform', type: 'builtin' },
  { id: 'model', label: 'Model', type: 'builtin' },
  { id: 'status', label: 'Status', type: 'builtin' },
  { id: 'week', label: 'Week', type: 'builtin' },
  { id: 'month', label: 'Month', type: 'builtin' },
];

const BUILTIN_FILTER_OPTIONS: Record<string, string[]> = {
  platform: ['tiktok', 'instagram', 'youtube'],
  status: ['queued', 'processing', 'completed', 'failed'],
};

const METRIC_OPTIONS = [
  { value: 'views', label: 'Views' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' },
  { value: 'posts', label: 'Posts' },
  { value: 'engagement_rate', label: 'Engagement Rate' },
];

type PivotRow = {
  rowDims: { field: string; value: string }[];
  colDims: { field: string; value: string }[];
  metricValue: number;
};

type ActiveFilter = {
  field: string;
  label: string;
  values: string[];
};

const DATE_RANGE_PRESETS = [
  { label: 'All Time', value: 'all' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'Custom', value: 'custom' },
] as const;

export default function VariableTracking() {
  const { variables, loading: varsLoading } = useVariables();
  const [rowFields, setRowFields] = useState<PivotFieldData[]>([]);
  const [colFields, setColFields] = useState<PivotFieldData[]>([]);
  const [metric, setMetric] = useState('views');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [filterMenuOpen, setFilterMenuOpen] = useState<string | null>(null);
  const [pivotData, setPivotData] = useState<PivotRow[]>([]);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [activeField, setActiveField] = useState<PivotFieldData | null>(null);
  const [dateRange, setDateRange] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const allFields = useMemo<PivotFieldData[]>(() => {
    const varFields: PivotFieldData[] = variables.map(v => ({
      id: `var_${v.id}`,
      label: v.name,
      type: 'variable' as const,
      variableType: v.type,
      color: v.color,
    }));
    return [...BUILTIN_FIELDS, ...varFields];
  }, [variables]);

  const usedFieldIds = useMemo(() => {
    const ids = new Set<string>();
    rowFields.forEach(f => ids.add(f.id));
    colFields.forEach(f => ids.add(f.id));
    return ids;
  }, [rowFields, colFields]);

  // Get filter options for a field
  const getFilterOptions = useCallback((fieldId: string): string[] => {
    if (BUILTIN_FILTER_OPTIONS[fieldId]) return BUILTIN_FILTER_OPTIONS[fieldId];
    // For variables, get options from the variable definition
    const varId = fieldId.replace('var_', '');
    const variable = variables.find(v => v.id === varId);
    if (variable?.type === 'boolean') return ['true', 'false'];
    if (variable?.type === 'categorical' && variable.options) return variable.options;
    return [];
  }, [variables]);

  // Fetch pivot data
  const fetchPivot = useCallback(async () => {
    if (rowFields.length === 0 && colFields.length === 0) {
      setPivotData([]);
      return;
    }

    setPivotLoading(true);
    try {
      const params = new URLSearchParams();
      if (rowFields.length > 0) params.set('rows', rowFields.map(f => f.id).join(','));
      if (colFields.length > 0) params.set('columns', colFields.map(f => f.id).join(','));
      params.set('metric', metric);
      params.set('agg', 'sum');
      if (activeFilters.length > 0) {
        params.set('filters', JSON.stringify(activeFilters.map(f => ({ field: f.field, values: f.values }))));
      }
      // Date range
      if (dateRange !== 'all') {
        if (dateRange === 'custom') {
          if (dateFrom) params.set('dateFrom', dateFrom);
          if (dateTo) params.set('dateTo', dateTo);
        } else {
          const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
          const from = new Date();
          from.setDate(from.getDate() - days);
          params.set('dateFrom', from.toISOString().split('T')[0]);
        }
      }

      const res = await fetch(`/api/variables/pivot?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPivotData(data);
      }
    } catch {
      // silent
    } finally {
      setPivotLoading(false);
    }
  }, [rowFields, colFields, metric, activeFilters, dateRange, dateFrom, dateTo]);

  useEffect(() => {
    fetchPivot();
  }, [fetchPivot]);

  const handleDragStart = (event: DragStartEvent) => {
    const field = allFields.find(f => f.id === event.active.id);
    setActiveField(field || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveField(null);
    const { active, over } = event;
    if (!over) return;

    const fieldId = active.id as string;
    const field = allFields.find(f => f.id === fieldId);
    if (!field) return;

    setRowFields(prev => prev.filter(f => f.id !== fieldId));
    setColFields(prev => prev.filter(f => f.id !== fieldId));

    const zone = over.id as string;
    if (zone === 'rows') {
      setRowFields(prev => [...prev.filter(f => f.id !== fieldId), field]);
    } else if (zone === 'columns') {
      setColFields(prev => [...prev.filter(f => f.id !== fieldId), field]);
    }
  };

  const removeFromRows = (id: string) => setRowFields(prev => prev.filter(f => f.id !== id));
  const removeFromCols = (id: string) => setColFields(prev => prev.filter(f => f.id !== id));

  // Filter management
  const addFilter = (fieldId: string) => {
    const field = allFields.find(f => f.id === fieldId);
    if (!field) return;
    if (activeFilters.some(f => f.field === fieldId)) return;
    const options = getFilterOptions(fieldId);
    setActiveFilters(prev => [...prev, { field: fieldId, label: field.label, values: [...options] }]);
    setFilterMenuOpen(null);
  };

  const removeFilter = (fieldId: string) => {
    setActiveFilters(prev => prev.filter(f => f.field !== fieldId));
  };

  const toggleFilterValue = (fieldId: string, value: string) => {
    setActiveFilters(prev => prev.map(f => {
      if (f.field !== fieldId) return f;
      const has = f.values.includes(value);
      const next = has ? f.values.filter(v => v !== value) : [...f.values, value];
      return { ...f, values: next };
    }));
  };

  const selectAllFilterValues = (fieldId: string) => {
    const options = getFilterOptions(fieldId);
    setActiveFilters(prev => prev.map(f => f.field === fieldId ? { ...f, values: [...options] } : f));
  };

  const clearAllFilterValues = (fieldId: string) => {
    setActiveFilters(prev => prev.map(f => f.field === fieldId ? { ...f, values: [] } : f));
  };

  const metricLabel = METRIC_OPTIONS.find(m => m.value === metric)?.label || metric;
  const fieldLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    allFields.forEach(f => { labels[f.id] = f.label; });
    return labels;
  }, [allFields]);

  // Filterable fields = all fields that have discrete options
  const filterableFields = useMemo(() => {
    return allFields.filter(f => {
      if (f.id === 'platform' || f.id === 'status') return true;
      if (f.type === 'variable' && (f.variableType === 'boolean' || f.variableType === 'categorical')) return true;
      return false;
    });
  }, [allFields]);

  if (varsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-5">
        {/* Left sidebar */}
        <div className="w-[250px] shrink-0 space-y-4">
          <PivotFieldList fields={allFields} usedFieldIds={usedFieldIds} />

          <PivotDropZone id="rows" label="Rows" fields={rowFields} onRemove={removeFromRows} />
          <PivotDropZone id="columns" label="Columns" fields={colFields} onRemove={removeFromCols} />

          {/* Values */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Values</label>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
            >
              {METRIC_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Date Range</label>
            <div className="flex flex-wrap gap-1">
              {DATE_RANGE_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setDateRange(p.value)}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    dateRange === p.value
                      ? 'bg-[var(--primary)] text-white'
                      : 'border border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {dateRange === 'custom' && (
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-7 pr-2 text-[10px] font-medium text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">to</span>
                <div className="relative flex-1">
                  <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-7 pr-2 text-[10px] font-medium text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Filters</label>
              <div className="relative">
                <button
                  onClick={() => setFilterMenuOpen(filterMenuOpen ? null : 'add')}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)] hover:bg-[var(--primary)]/5"
                >
                  <Filter className="h-2.5 w-2.5" /> Add
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                {filterMenuOpen === 'add' && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFilterMenuOpen(null)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
                      {filterableFields
                        .filter(f => !activeFilters.some(af => af.field === f.id))
                        .map(f => (
                          <button
                            key={f.id}
                            onClick={() => addFilter(f.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
                          >
                            {f.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />}
                            {f.label}
                          </button>
                        ))
                      }
                      {filterableFields.filter(f => !activeFilters.some(af => af.field === f.id)).length === 0 && (
                        <p className="px-3 py-1.5 text-[10px] text-[var(--text-muted)]">All fields filtered</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilters.map(f => {
              const options = getFilterOptions(f.field);
              const isOpen = filterMenuOpen === f.field;
              const allSelected = f.values.length === options.length;
              const selectedCount = f.values.length;
              return (
                <div key={f.field} className="relative">
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5">
                    <button
                      onClick={() => setFilterMenuOpen(isOpen ? null : f.field)}
                      className="flex flex-1 items-center gap-1.5 text-xs font-medium text-[var(--foreground)]"
                    >
                      <Filter className="h-3 w-3 text-[var(--text-muted)]" />
                      <span className="truncate">{f.label}</span>
                      <span className="shrink-0 rounded bg-[var(--muted)] px-1 py-0.5 text-[9px] text-[var(--text-muted)]">
                        {allSelected ? 'All' : `${selectedCount}/${options.length}`}
                      </span>
                      <ChevronDown className={`ml-auto h-3 w-3 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button onClick={() => removeFilter(f.field)} className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {isOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFilterMenuOpen(null)} />
                      <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1">
                          <button onClick={() => selectAllFilterValues(f.field)} className="text-[10px] font-medium text-[var(--primary)] hover:underline">
                            Select All
                          </button>
                          <button onClick={() => clearAllFilterValues(f.field)} className="text-[10px] font-medium text-[var(--text-muted)] hover:underline">
                            Clear
                          </button>
                        </div>
                        {options.map(opt => {
                          const checked = f.values.includes(opt);
                          return (
                            <label key={opt} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--muted)]">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFilterValue(f.field, opt)}
                                className="h-3 w-3 rounded border-[var(--border)] accent-[var(--primary)]"
                              />
                              <span className="capitalize">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: pivot table */}
        <div className="flex-1 min-w-0">
          <PivotTable
            data={pivotData}
            rowFields={rowFields.map(f => f.id)}
            columnFields={colFields.map(f => f.id)}
            metricLabel={metricLabel}
            loading={pivotLoading}
            fieldLabels={fieldLabels}
          />
        </div>
      </div>

      <DragOverlay>
        {activeField && <PivotField field={activeField} compact />}
      </DragOverlay>
    </DndContext>
  );
}
