'use client';

type FollowerStat = {
  accountId: string;
  platform: string;
  username: string;
  displayName?: string;
  followerCount: number;
  followerGrowth: number;
  growthRate: number;
  dataPoints: number;
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#00f2ea',
  instagram: '#E1306C',
  youtube: '#FF0000',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  threads: '#000000',
  bluesky: '#0085FF',
};

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: 'TT',
  instagram: 'IG',
  youtube: 'YT',
  facebook: 'FB',
  linkedin: 'LI',
  twitter: 'X',
  threads: 'TH',
  bluesky: 'BS',
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function LateAccountCards({ followerStats }: { followerStats: FollowerStat[] }) {
  if (followerStats.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Accounts</h3>
        <div className="flex items-center justify-center h-48 text-sm text-[var(--text-muted)]">No account data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Connected Accounts</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {followerStats.map(account => {
          const color = PLATFORM_COLORS[account.platform] || '#888';
          const icon = PLATFORM_ICONS[account.platform] || account.platform.slice(0, 2).toUpperCase();
          const isPositive = account.followerGrowth >= 0;

          return (
            <div key={account.accountId} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 hover:border-[var(--primary)] transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm text-[var(--text-primary)] truncate">
                    {account.displayName || account.username}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    @{account.username} &middot; {account.platform}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-[var(--text-muted)]">Followers</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">{formatNumber(account.followerCount)}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">Growth</div>
                  <div className={`text-lg font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {isPositive ? '+' : ''}{account.growthRate.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">Net Change</div>
                  <div className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {isPositive ? '+' : ''}{formatNumber(account.followerGrowth)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">Data Points</div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{account.dataPoints}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
