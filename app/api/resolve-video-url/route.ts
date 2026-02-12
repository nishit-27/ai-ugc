import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getVideoDownloadUrl } from '@/lib/processJob';

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: string };

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!config.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'RapidAPI key not configured' }, { status: 500 });
    }

    const videoUrl = await getVideoDownloadUrl(url, config.RAPIDAPI_KEY);
    return NextResponse.json({ videoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve video URL';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
