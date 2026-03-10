import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type AccountHealth = {
  accountId: string;
  platform: string;
  username?: string;
  displayName?: string;
  profileId?: string;
  status: 'healthy' | 'warning' | 'error';
  canPost: boolean;
  canFetchAnalytics: boolean;
  tokenValid: boolean;
  tokenExpiresAt?: string;
  needsReconnect: boolean;
  issues: string[];
};

type HealthResponse = {
  summary?: { total?: number; healthy?: number; needsReconnect?: number };
  accounts?: AccountHealth[];
};

export async function GET() {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const results = await fetchFromAllKeys<HealthResponse>('/accounts/health');
    const allAccounts: (AccountHealth & { apiKeyIndex: number })[] = [];

    for (const { apiKeyIndex, data } of results) {
      for (const account of data.accounts || []) {
        allAccounts.push({ ...account, apiKeyIndex });
      }
    }

    const total = allAccounts.length;
    const healthy = allAccounts.filter((a) => a.status === 'healthy').length;
    const needsReconnect = allAccounts.filter((a) => a.needsReconnect).length;

    return NextResponse.json({
      summary: { total, healthy, needsReconnect },
      accounts: allAccounts,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
