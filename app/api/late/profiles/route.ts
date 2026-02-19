import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { fetchFromAllKeys, getBalancedApiKeyIndex, getAccountLabel, getKeyUsage, MAX_PROFILES_PER_KEY } from '@/lib/lateAccountPool';
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
    const results = await fetchFromAllKeys<{ profiles?: LateProfile[] }>('/profiles');
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
      // Check cap on the requested key
      const counts = await getProfileCountPerKey();
      const currentCount = counts.get(requestedIndex) ?? 0;
      if (currentCount >= MAX_PROFILES_PER_KEY) {
        return NextResponse.json(
          { error: `${getAccountLabel(requestedIndex)} is full (${MAX_PROFILES_PER_KEY}/${MAX_PROFILES_PER_KEY} profiles). Choose a different account.` },
          { status: 400 }
        );
      }
      targetIndex = requestedIndex;
    } else {
      targetIndex = await getBalancedApiKeyIndex();
    }
    const apiKey = config.LATE_API_KEYS[targetIndex];

    const data = await lateApiRequest<{ profile?: LateProfile }>('/profiles', {
      method: 'POST',
      body: JSON.stringify(profileData),
      apiKey,
    });

    const profile = (data as { profile?: LateProfile }).profile ?? data;
    const profileId = (profile as LateProfile)?._id;
    if (profileId) {
      await saveProfileApiKey(profileId, targetIndex);
    }

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
