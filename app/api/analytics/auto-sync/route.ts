import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';
import { createAnalyticsAccount, getAllAnalyticsAccounts } from '@/lib/db-analytics';

type LateAccount = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
};

// Map Late API platform names to our analytics platform names
const SUPPORTED_PLATFORMS: Record<string, string> = {
  tiktok: 'tiktok',
  instagram: 'instagram',
  youtube: 'youtube',
};

export async function POST() {
  try {
    await ensureDatabaseReady();

    // Fetch connected accounts from ALL GetLate API keys
    const results = await fetchFromAllKeys<{ accounts?: LateAccount[] }>('/accounts');
    const lateAccounts: LateAccount[] = [];
    for (const { data } of results) {
      for (const account of data.accounts || []) {
        lateAccounts.push(account);
      }
    }

    // Get existing analytics accounts to avoid duplicates
    const existingAccounts = await getAllAnalyticsAccounts();
    const existingSet = new Set(
      existingAccounts.map((a: { platform: string; username: string }) => `${a.platform}:${a.username.toLowerCase()}`)
    );

    const added: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const la of lateAccounts) {
      const platform = SUPPORTED_PLATFORMS[la.platform];
      if (!platform) {
        skipped.push(`${la.platform}/@${la.username} (unsupported platform)`);
        continue;
      }

      const username = la.username || la.displayName;
      if (!username) {
        skipped.push(`${la.platform} account ${la._id} (no username)`);
        continue;
      }

      const cleanUsername = username.replace(/^@/, '').toLowerCase();
      const key = `${platform}:${cleanUsername}`;

      if (existingSet.has(key)) {
        skipped.push(`${platform}/@${cleanUsername} (already tracked)`);
        continue;
      }

      try {
        await createAnalyticsAccount({
          platform,
          username: cleanUsername,
          accountId: null,
          displayName: la.displayName || null,
          profileUrl: la.profilePicture || null,
          lateAccountId: la._id,
          followers: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          engagementRate: 0,
          metadata: null,
        });

        added.push(`${platform}/@${cleanUsername}`);
        existingSet.add(key);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${platform}/@${cleanUsername}: ${msg}`);
      }
    }

    return NextResponse.json({
      totalLateAccounts: lateAccounts.length,
      added,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('[analytics] auto-sync error:', error);
    return NextResponse.json({ error: 'Failed to auto-sync accounts' }, { status: 500 });
  }
}
