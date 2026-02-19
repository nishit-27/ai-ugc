import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  if (!config.LATE_API_KEYS[0]) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }

  try {
    const profilesRes = await fetch(`${config.LATE_API_URL}/profiles`, {
      headers: { Authorization: `Bearer ${config.LATE_API_KEYS[0]}` },
    });
    if (!profilesRes.ok) throw new Error('Failed to fetch profiles');
    const profilesData = (await profilesRes.json()) as { profiles?: unknown[] };
    const existingProfiles = profilesData.profiles || [];
    const profileNumber = existingProfiles.length + 1;
    const profileName = `TikTok Account ${profileNumber}`;

    const createProfileRes = await fetch(`${config.LATE_API_URL}/profiles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.LATE_API_KEYS[0]}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: profileName,
        description: `Profile for TikTok account #${profileNumber}`,
      }),
    });
    if (!createProfileRes.ok) {
      const error = await createProfileRes.text();
      throw new Error(`Failed to create profile: ${error}`);
    }
    const newProfile = (await createProfileRes.json()) as { profile?: { _id: string }; _id?: string };
    const profileId = newProfile.profile?._id ?? newProfile._id;
    if (!profileId) throw new Error('Failed to get new profile ID');

    const connectRes = await fetch(
      `${config.LATE_API_URL}/connect/tiktok?profileId=${profileId}`,
      { headers: { Authorization: `Bearer ${config.LATE_API_KEYS[0]}` } }
    );
    if (connectRes.ok) {
      const data = (await connectRes.json()) as {
        url?: string;
        connectUrl?: string;
        authUrl?: string;
        authorization_url?: string;
      };
      const connectUrl = data.url ?? data.connectUrl ?? data.authUrl ?? data.authorization_url;
      if (connectUrl) {
        return NextResponse.json({ connectUrl, profileName, profileId });
      }
    }

    return NextResponse.json({
      connectUrl: 'https://getlate.dev/dashboard/accounts',
      fallback: true,
      message: 'Connect your TikTok account via the Late dashboard',
    });
  } catch (error) {
    console.error('TikTok connect error:', (error as Error).message);
    return NextResponse.json({
      connectUrl: 'https://getlate.dev/dashboard/accounts',
      fallback: true,
      message: (error as Error).message || 'Connect your TikTok account via the Late dashboard',
    });
  }
}
