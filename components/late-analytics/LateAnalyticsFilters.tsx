'use client';
import { RefreshCw, Download } from 'lucide-react';

type Filters = { platform: string; dateRange: string; sortBy: string };

export default function LateAnalyticsFilters({
  filters, setFilters, lastSync, onRefresh
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  lastSync: string | null;
  onRefresh: () => void;
}) {
  const selectClass = "appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 pr-8 text-sm font-medium text-[var(--text-primary)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors bg-[length:16px] bg-[right_8px_center] bg-no-repeat";
  const chevronStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className={selectClass} style={chevronStyle} value={filters.platform} onChange={e => setFilters({ ...filters, platform: e.target.value })}>
          <option value="">All platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="facebook">Facebook</option>
          <option value="linkedin">LinkedIn</option>
          <option value="twitter">X / Twitter</option>
          <option value="threads">Threads</option>
          <option value="bluesky">Bluesky</option>
        </select>

        <select className={selectClass} style={chevronStyle} value="all-profiles" disabled>
          <option value="all-profiles">All profiles</option>
        </select>

        <select className={selectClass} style={chevronStyle} value="all-sources" disabled>
          <option value="all-sources">All sources</option>
        </select>

        <select className={selectClass} style={chevronStyle} value={filters.dateRange} onChange={e => setFilters({ ...filters, dateRange: e.target.value })}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="180d">Last 6 months</option>
          <option value="365d">Last year</option>
          <option value="all">All time</option>
        </select>

        <select className={selectClass} style={chevronStyle} value={filters.sortBy} onChange={e => setFilters({ ...filters, sortBy: e.target.value })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="engagement">Most engagement</option>
        </select>

        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
          {lastSync && (
            <div className="text-right leading-tight">
              <div>Last sync: {getRelativeTime(lastSync)}</div>
              <div>Next sync: in {getNextSync(lastSync)}</div>
            </div>
          )}
          <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors" title="Refresh">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function getNextSync(lastSyncIso: string): string {
  const elapsed = Date.now() - new Date(lastSyncIso).getTime();
  const remaining = Math.max(0, 60 * 60000 - elapsed); // 60 min cycle
  const mins = Math.ceil(remaining / 60000);
  return `${mins}m`;
}
