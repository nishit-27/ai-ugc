import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const data = (await lateApiRequest<{ profiles?: unknown[] }>('/profiles')) as { profiles?: unknown[] };
    return NextResponse.json({ profiles: data.profiles || [] });
  } catch (error) {
    console.error('Late API profiles error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const body = await request.json();
    const { name, description, color } = body as { name?: string; description?: string; color?: string };
    const profileData = { name, description } as Record<string, unknown>;
    if (color) profileData.color = color;
    const data = await lateApiRequest<{ profile?: unknown }>('/profiles', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
    return NextResponse.json({ profile: (data as { profile?: unknown }).profile ?? data });
  } catch (error) {
    console.error('Late API create profile error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
