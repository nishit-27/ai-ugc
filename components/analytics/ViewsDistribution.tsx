'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalyticsMediaItem } from '@/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function ViewsDistribution({ items }: { items: AnalyticsMediaItem[] }) {
  const top20 = items.slice(0, 20);

  if (top20.length === 0) {
    return (
      <Card className="border-[var(--border)]">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Views Distribution</CardTitle></CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
          No content data yet.
        </CardContent>
      </Card>
    );
  }

  const data = top20.map((item, i) => ({
    name: `#${i + 1}`,
    views: item.views,
    label: (item.title || item.caption || 'Untitled').slice(0, 30),
  }));

  return (
    <Card className="border-[var(--border)]">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Views Distribution (Top 20)</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--foreground)' }} itemStyle={{ color: 'var(--foreground)' }}
                formatter={(value: number) => [formatNumber(value), 'Views']}
                labelFormatter={(_label: string, payload: Array<{ payload?: { label?: string } }>) => payload?.[0]?.payload?.label || ''}
              />
              <Bar dataKey="views" fill="var(--primary)" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
