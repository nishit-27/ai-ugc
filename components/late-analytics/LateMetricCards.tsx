'use client';
import { Heart, MessageCircle, Share2, Eye, BarChart2, Users, MousePointer, TrendingUp } from 'lucide-react';

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

type Totals = { likes: number; comments: number; shares: number; views: number; impressions: number; reach: number; clicks: number; saves: number; postCount: number };

export default function LateMetricCards({ totals, totalFollowers }: { totals: Totals; totalFollowers: number }) {
  const engRate = totals.views > 0 ? ((totals.likes + totals.comments + totals.shares) / totals.views * 100) : 0;

  const cards = [
    { label: 'Likes', value: totals.likes, icon: Heart, color: 'text-red-500' },
    { label: 'Comments', value: totals.comments, icon: MessageCircle, color: 'text-blue-500' },
    { label: 'Shares', value: totals.shares, icon: Share2, color: 'text-green-500' },
    { label: 'Views', value: totals.views, icon: Eye, color: 'text-purple-500' },
    { label: 'Impressions', value: totals.impressions, icon: BarChart2, color: 'text-cyan-500' },
    { label: 'Reach', value: totals.reach, icon: Users, color: 'text-orange-500' },
    { label: 'Clicks', value: totals.clicks, icon: MousePointer, color: 'text-slate-500' },
    { label: 'Eng. Rate', value: engRate, icon: TrendingUp, color: 'text-emerald-500', isPercent: true },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={`h-3.5 w-3.5 ${card.color}`} />
              <span className="text-xs text-[var(--text-muted)]">{card.label}</span>
            </div>
            <div className="text-lg font-bold text-[var(--text-primary)]">
              {card.isPercent ? engRate.toFixed(1) + '%' : formatNum(card.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
