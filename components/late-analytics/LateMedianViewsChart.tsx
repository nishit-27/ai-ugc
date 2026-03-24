'use client';

import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDateKeyInTimeZone, listDateKeysInRange } from '@/lib/dateUtils';

type PostAnalytics = {
  postId: string;
  publishedAt: string;
  platforms: { platform: string; accountId: string; accountUsername: string; analytics?: Record<string, number> }[];
  analytics: { views: number; likes: number; comments: number; shares: number };
};

type Account = { id: string; platform: string; username: string; displayName?: string };

type Granularity = 'week' | 'month' | 'overall';

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export default function LateMedianViewsChart({
  posts,
  accounts,
  dateRange,
}: {
  posts: PostAnalytics[];
  accounts: Account[];
  dateRange: { fromDate: string; toDate: string };
}) {
  const [granularity, setGranularity] = useState<Granularity>('week');

  // Build per-account views by period
  const chartData = useMemo(() => {
    // Map accountId → username for dedup
    const accountUsernames = new Map<string, string>();
    for (const a of accounts) {
      accountUsernames.set(a.id, a.username);
    }

    if (granularity === 'overall') {
      // Overall: single median across all accounts' total views
      const accountViews = new Map<string, number>();
      for (const post of posts) {
        if (!post.publishedAt) continue;
        for (const p of post.platforms || []) {
          const key = p.accountUsername || p.accountId;
          if (!key) continue;
          accountViews.set(key, (accountViews.get(key) || 0) + (post.analytics.views || 0));
        }
      }
      const views = Array.from(accountViews.values());
      const med = median(views);
      const accountCount = views.length;
      return [{ period: 'Overall', median: med, accountCount }];
    }

    // Weekly or monthly: group posts into periods, then compute median per period
    const getBucketKey = granularity === 'week' ? getWeekKey : getMonthKey;

    // Collect per-period, per-account views
    const periodAccountViews = new Map<string, Map<string, number>>();

    for (const post of posts) {
      if (!post.publishedAt) continue;
      const dateKey = getDateKeyInTimeZone(post.publishedAt);
      const bucketKey = getBucketKey(dateKey);

      if (!periodAccountViews.has(bucketKey)) {
        periodAccountViews.set(bucketKey, new Map());
      }
      const accMap = periodAccountViews.get(bucketKey)!;

      for (const p of post.platforms || []) {
        const key = p.accountUsername || p.accountId;
        if (!key) continue;
        accMap.set(key, (accMap.get(key) || 0) + (post.analytics.views || 0));
      }
    }

    // Sort periods and compute medians
    const periods = Array.from(periodAccountViews.keys()).sort();
    return periods.map((period) => {
      const accMap = periodAccountViews.get(period)!;
      const views = Array.from(accMap.values());
      return {
        period,
        median: median(views),
        accountCount: views.length,
      };
    });
  }, [posts, accounts, granularity, dateRange]);

  const overallMedian = chartData.length === 1 && granularity === 'overall'
    ? chartData[0].median
    : chartData.length > 0
      ? median(chartData.map((d) => d.median))
      : 0;

  const selectClass = "appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 pr-7 text-sm text-[var(--text-primary)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors bg-[length:14px] bg-[right_6px_center] bg-no-repeat";
  const chevronStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Median Views / Account</h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-primary)]">{formatNum(overallMedian)}</span>
            <span>median</span>
            {chartData.length > 0 && (
              <>
                <span>·</span>
                <span>{chartData[0]?.accountCount || 0} accounts</span>
              </>
            )}
          </div>
        </div>
        <select
          className={selectClass}
          style={chevronStyle}
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity)}
        >
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
          <option value="overall">Overall</option>
        </select>
      </div>

      {granularity === 'overall' ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <div className="text-4xl font-bold text-[var(--text-primary)]">{formatNum(overallMedian)}</div>
          <div className="text-sm text-[var(--text-muted)]">
            Median views per account across {chartData[0]?.accountCount || 0} accounts
          </div>
        </div>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickFormatter={(v: string) => {
                if (granularity === 'week') {
                  const d = new Date(v + 'T00:00:00');
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
                const [y, m] = v.split('-');
                return new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }}
              interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => formatNum(v)} />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#1f2937' }}
              labelFormatter={(v: string) => {
                if (granularity === 'week') {
                  const d = new Date(v + 'T00:00:00');
                  return `Week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
                }
                const [y, m] = v.split('-');
                return new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              }}
              formatter={(value: number, name: string) => [formatNum(value), 'Median Views']}
            />
            <Line
              type="monotone"
              dataKey="median"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              dot={{ fill: '#8b5cf6', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              name="median"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-[var(--text-muted)]">No data available</div>
      )}
    </div>
  );
}
