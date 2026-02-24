'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

type PivotRow = {
  rowDims: { field: string; value: string }[];
  colDims: { field: string; value: string }[];
  metricValue: number;
};

type Props = {
  data: PivotRow[];
  rowFields: string[];
  columnFields: string[];
  metricLabel: string;
  loading?: boolean;
  fieldLabels?: Record<string, string>;
};

type SortConfig = {
  key: string; // field id like 'platform', 'model', or '__metric' for the value column, or colKey for cross-tab columns
  direction: 'asc' | 'desc';
};

export default function PivotTable({ data, rowFields, columnFields, metricLabel, loading, fieldLabels = {} }: Props) {
  const [sort, setSort] = useState<SortConfig | null>(null);

  const { rowKeys, colKeys, cellMap } = useMemo(() => {
    const rowKeySet = new Map<string, string[]>();
    const colKeySet = new Map<string, string[]>();
    const cellMap = new Map<string, number>();

    for (const row of data) {
      const rk = row.rowDims.map(d => d.value).join('|||');
      const ck = row.colDims.map(d => d.value).join('|||');

      if (!rowKeySet.has(rk)) {
        rowKeySet.set(rk, row.rowDims.map(d => d.value));
      }
      if (ck && !colKeySet.has(ck)) {
        colKeySet.set(ck, row.colDims.map(d => d.value));
      }

      cellMap.set(`${rk}:::${ck}`, row.metricValue);
    }

    return {
      rowKeys: Array.from(rowKeySet.entries()),
      colKeys: Array.from(colKeySet.entries()),
      cellMap,
    };
  }, [data]);

  const toggleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'desc') return { key, direction: 'asc' };
        return null; // third click removes sort
      }
      return { key, direction: 'desc' };
    });
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sort?.key !== colKey) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
    return sort.direction === 'desc'
      ? <ArrowDown className="ml-1 inline h-3 w-3 text-[var(--primary)]" />
      : <ArrowUp className="ml-1 inline h-3 w-3 text-[var(--primary)]" />;
  };

  // Sort rows
  const sortedRowKeys = useMemo(() => {
    if (!sort) return rowKeys;
    const sorted = [...rowKeys];
    const mul = sort.direction === 'desc' ? -1 : 1;

    if (sort.key === '__metric') {
      // Sort by the metric value column (flat table)
      sorted.sort((a, b) => {
        const va = cellMap.get(`${a[0]}:::`) ?? 0;
        const vb = cellMap.get(`${b[0]}:::`) ?? 0;
        return (va - vb) * mul;
      });
    } else if (sort.key.startsWith('__col:::')) {
      // Sort by a specific column value (cross-tab)
      const colKey = sort.key.replace('__col:::', '');
      sorted.sort((a, b) => {
        const va = cellMap.get(`${a[0]}:::${colKey}`) ?? 0;
        const vb = cellMap.get(`${b[0]}:::${colKey}`) ?? 0;
        return (va - vb) * mul;
      });
    } else {
      // Sort by a row dimension field
      const fieldIdx = rowFields.indexOf(sort.key);
      if (fieldIdx >= 0) {
        sorted.sort((a, b) => {
          const va = a[1][fieldIdx] || '';
          const vb = b[1][fieldIdx] || '';
          // Try numeric sort first
          const na = Number(va), nb = Number(vb);
          if (!isNaN(na) && !isNaN(nb)) return (na - nb) * mul;
          return va.localeCompare(vb) * mul;
        });
      }
    }
    return sorted;
  }, [rowKeys, sort, cellMap, rowFields]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm text-[var(--text-muted)]">No data to display</p>
        <p className="text-xs text-[var(--text-muted)]">Drag fields into Rows and/or Columns, then select a metric</p>
      </div>
    );
  }

  const hasColumns = colKeys.length > 0;

  // Simple flat table when no column dimensions
  if (!hasColumns) {
    return (
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              {rowFields.map(f => (
                <th
                  key={f}
                  onClick={() => toggleSort(f)}
                  className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  {formatFieldLabel(f, fieldLabels)}
                  <SortIcon colKey={f} />
                </th>
              ))}
              <th
                onClick={() => toggleSort('__metric')}
                className="cursor-pointer select-none px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {metricLabel}
                <SortIcon colKey="__metric" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRowKeys.map(([key, vals]) => (
              <tr key={key} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50">
                {vals.map((v, i) => (
                  <td key={i} className="px-3 py-2 font-medium">{v}</td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatNumber(cellMap.get(`${key}:::`) ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Full pivot table with row & column dimensions
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            {rowFields.map(f => (
              <th
                key={f}
                onClick={() => toggleSort(f)}
                className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {formatFieldLabel(f, fieldLabels)}
                <SortIcon colKey={f} />
              </th>
            ))}
            {colKeys.map(([key, vals]) => (
              <th
                key={key}
                onClick={() => toggleSort(`__col:::${key}`)}
                className="cursor-pointer select-none px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {vals.join(' / ')}
                <SortIcon colKey={`__col:::${key}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRowKeys.map(([rowKey, rowVals]) => (
            <tr key={rowKey} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50">
              {rowVals.map((v, i) => (
                <td key={i} className="px-3 py-2 font-medium">{v}</td>
              ))}
              {colKeys.map(([colKey]) => (
                <td key={colKey} className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(cellMap.get(`${rowKey}:::${colKey}`) ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatFieldLabel(field: string, labels: Record<string, string> = {}): string {
  if (labels[field]) return labels[field];
  if (field.startsWith('var_')) return field.replace('var_', '').substring(0, 8) + '...';
  return field.charAt(0).toUpperCase() + field.slice(1);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}
