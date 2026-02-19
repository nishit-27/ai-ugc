import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { getAllTikTokAccounts, createTikTokAccount } from '@/lib/db';

export async function GET() {
  const accounts: {
    id?: string;
    _id: string;
    platform: string;
    displayName?: string;
    username?: string;
    profilePicture?: string;
    isDefault?: boolean;
  }[] = [];

  // Get accounts from our database
  try {
    const dbAccounts = await getAllTikTokAccounts();
    dbAccounts.forEach((acc: { id: string; accountId: string; platform?: string; displayName?: string; username?: string; profilePicture?: string } | null) => {
      if (acc) {
        accounts.push({
          id: acc.id,
          _id: acc.accountId,
          platform: acc.platform || 'tiktok',
          displayName: acc.displayName,
          username: acc.username,
          profilePicture: acc.profilePicture,
        });
      }
    });
  } catch (err) {
    console.log('Database accounts fetch failed:', (err as Error).message);
  }

  // Also add the default account from config if not already in DB
  if (config.TIKTOK_ACCOUNT_ID) {
    const exists = accounts.find((a) => a._id === config.TIKTOK_ACCOUNT_ID);
    if (!exists) {
      accounts.unshift({
        _id: config.TIKTOK_ACCOUNT_ID,
        platform: 'tiktok',
        displayName: 'Default Account',
        username: 'configured-account',
        isDefault: true,
      });
    }
  }

  // Sync accounts from Late API and store in our database
  if (config.LATE_API_KEYS[0]) {
    try {
      const data = (await lateApiRequest<{ accounts?: { _id: string; platform: string; displayName?: string; username?: string; profilePicture?: string }[] }>(
        '/accounts'
      )) as { accounts?: { _id: string; platform: string; displayName?: string; username?: string; profilePicture?: string }[] };

      const tiktokAccounts = (data.accounts || []).filter((acc) => acc.platform === 'tiktok');

      for (const acc of tiktokAccounts) {
        // Save to our database
        try {
          await createTikTokAccount({
            accountId: acc._id,
            username: acc.username || null,
            displayName: acc.displayName || null,
            profilePicture: acc.profilePicture || null,
            accessToken: null,
            refreshToken: null,
            profileId: null,
          });
        } catch {}

        // Add to response if not already there
        if (!accounts.find((a) => a._id === acc._id)) {
          accounts.push({
            _id: acc._id,
            platform: acc.platform,
            displayName: acc.displayName,
            username: acc.username,
            profilePicture: acc.profilePicture,
          });
        }
      }
    } catch (err) {
      console.log('Late API accounts fetch failed:', (err as Error).message);
    }
  }

  return NextResponse.json({ accounts });
}
