import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { fetchFromAllKeys, getAccountLabel } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type LateAccount = {
  _id: string;
  platform?: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  createdAt?: string;
  profileId?: { _id: string } | string;
  [key: string]: unknown;
};

export async function GET() {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const results = await fetchFromAllKeys<{ accounts?: LateAccount[] }>('/accounts');
    const allAccounts: (LateAccount & { apiKeyIndex: number; accountLabel: string })[] = [];

    for (const { apiKeyIndex, data } of results) {
      for (const account of data.accounts || []) {
        allAccounts.push({
          ...account,
          apiKeyIndex,
          accountLabel: getAccountLabel(apiKeyIndex),
        });
      }
    }

    return NextResponse.json({ accounts: allAccounts });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
