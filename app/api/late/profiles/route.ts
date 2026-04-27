import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import {
  fetchFromAllKeys,
  getBalancedApiKeyIndex,
  getAccountLabel,
  getKeyUsage,
  isQuotaError,
  learnLimitFromQuotaError,
  bumpLearnedLimitIfNeeded,
} from '@/lib/lateAccountPool';
import { saveProfileApiKey, getProfileApiKeysBatch, getProfileCountPerKey } from '@/lib/db-late-profile-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type LateProfile = {
  _id: string;
  name?: string;
  description?: string;
  color?: string;
  [key: string]: unknown;
};

export async function GET() {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const results = await fetchFromAllKeys<{ profiles?: LateProfile[] }>('/profiles?limit=10000');
    const allProfiles: (LateProfile & { apiKeyIndex: number; accountLabel: string })[] = [];
    const profileIds: string[] = [];

    for (const { apiKeyIndex, data } of results) {
      for (const profile of data.profiles || []) {
        allProfiles.push({
          ...profile,
          apiKeyIndex,
          accountLabel: getAccountLabel(apiKeyIndex),
        });
        profileIds.push(profile._id);
      }
    }

    // Sync profile→key mapping for any profiles we haven't seen before
    const existingMappings = await getProfileApiKeysBatch(profileIds);
    for (const profile of allProfiles) {
      if (!existingMappings.has(profile._id)) {
        await saveProfileApiKey(profile._id, profile.apiKeyIndex);
      }
    }

    const keyUsage = await getKeyUsage();
    return NextResponse.json({ profiles: allProfiles, apiKeyCount: config.LATE_API_KEYS.length, keyUsage });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const body = await request.json();
    const { name, description, color, apiKeyIndex: requestedIndex } = body as { name?: string; description?: string; color?: string; apiKeyIndex?: number };
    const profileData = { name, description } as Record<string, unknown>;
    if (color) profileData.color = color;

    // Use explicit apiKeyIndex if provided and valid, otherwise auto-balance
    let targetIndex: number;
    if (typeof requestedIndex === 'number' && requestedIndex >= 0 && requestedIndex < config.LATE_API_KEYS.length) {
      // Check cap on the requested key using per-key limits
      const usage = await getKeyUsage();
      const keyInfo = usage.find((k) => k.index === requestedIndex);
      if (keyInfo && keyInfo.count >= keyInfo.max) {
        return NextResponse.json(
          { error: `${getAccountLabel(requestedIndex)} is full (${keyInfo.count}/${keyInfo.max} profiles). Choose a different account.` },
          { status: 400 }
        );
      }
      targetIndex = requestedIndex;
    } else {
      targetIndex = await getBalancedApiKeyIndex();
    }
    const apiKey = config.LATE_API_KEYS[targetIndex];

    let data: { profile?: LateProfile };
    try {
      data = await lateApiRequest<{ profile?: LateProfile }>('/profiles', {
        method: 'POST',
        body: JSON.stringify(profileData),
        apiKey,
      });
    } catch (err) {
      // Auto-detect: if Late rejected this add because the plan cap was hit,
      // learn the cap from the current count so the balancer skips this key
      // going forward — no env var needed.
      if (isQuotaError(err)) {
        const counts = await getProfileCountPerKey();
        const observed = counts.get(targetIndex) ?? 0;
        await learnLimitFromQuotaError(targetIndex, observed);
        const status = err instanceof LateApiError && err.status ? err.status : 400;
        return NextResponse.json(
          {
            error: `${getAccountLabel(targetIndex)} is full (Late returned: ${(err as Error).message}). Cap learned at ${observed} — try again to route to another account.`,
          },
          { status }
        );
      }
      throw err;
    }

    const profile = (data as { profile?: LateProfile }).profile ?? data;
    const profileId = (profile as LateProfile)?._id;
    if (profileId) {
      await saveProfileApiKey(profileId, targetIndex);
    }

    // Auto-detect: if the user upgraded their plan and we previously learned a
    // smaller cap, bump it up to the new observed count so we stop blocking adds.
    const countsAfter = await getProfileCountPerKey();
    const newCount = countsAfter.get(targetIndex) ?? 0;
    await bumpLearnedLimitIfNeeded(targetIndex, newCount);

    return NextResponse.json({
      profile: {
        ...profile,
        apiKeyIndex: targetIndex,
        accountLabel: getAccountLabel(targetIndex),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
