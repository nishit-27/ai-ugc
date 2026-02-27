import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';
import { createAnalyticsAccount, getAllAnalyticsAccounts, updateAnalyticsAccount } from '@/lib/db-analytics';
import { invalidatePivotCache } from '@/lib/pivot-cache';

export const dynamic = 'force-dynamic';

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
    const existingMap = new Map<string, { id: string; late_account_id: string | null }>();
    for (const a of existingAccounts) {
      existingMap.set(`${a.platform}:${a.username.toLowerCase()}`, { id: a.id, late_account_id: a.late_account_id });
    }

    const added: string[] = [];
    const skipped: string[] = [];
    const updated: string[] = [];
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

      const existing = existingMap.get(key);
      if (existing) {
        // Back-fill late_account_id if it's missing on the existing analytics account
        if (!existing.late_account_id && la._id) {
          try {
            await updateAnalyticsAccount(existing.id, { lateAccountId: la._id });
            updated.push(`${platform}/@${cleanUsername} (linked late_account_id)`);
          } catch (err) {
            console.error(`[analytics] Failed to backfill late_account_id for ${existing.id}:`, err);
          }
        }
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
        existingMap.set(key, { id: '', late_account_id: la._id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${platform}/@${cleanUsername}: ${msg}`);
      }
    }

    if (added.length > 0 || updated.length > 0) {
      invalidatePivotCache();
    }

    return NextResponse.json({
      totalLateAccounts: lateAccounts.length,
      added,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('[analytics] auto-sync error:', error);
    return NextResponse.json({ error: 'Failed to auto-sync accounts' }, { status: 500 });
  }
}
