import { NextRequest, NextResponse } from 'next/server';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
    }

    // Validate it's a GCS URL
    if (!url.includes('storage.googleapis.com')) {
      return NextResponse.json({ error: 'Invalid GCS URL' }, { status: 400 });
    }

    const signedUrl = await getCachedSignedUrl(url);

    return NextResponse.json({ signedUrl });
  } catch (err) {
    console.error('Get signed URL error:', err);
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
  }
}

/**
 * POST /api/signed-url — batch sign multiple GCS URLs in one call.
 * Body: { urls: string[] }
 * Response: { signed: Record<string, string> }
 */
export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json() as { urls?: string[] };

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array is required' }, { status: 400 });
    }

    // Cap at 100 per request to avoid timeouts
    const batch = urls.slice(0, 100);

    const results = await Promise.all(
      batch.map(async (url) => {
        if (!url?.includes('storage.googleapis.com')) return [url, url] as const;
        try {
          const signed = await getCachedSignedUrl(url);
          return [url, signed] as const;
        } catch {
          return [url, url] as const;
        }
      }),
    );

    const signed: Record<string, string> = {};
    for (const [original, result] of results) {
      signed[original] = result;
    }

    return NextResponse.json({ signed });
  } catch (err) {
    console.error('Batch sign URLs error:', err);
    return NextResponse.json({ error: 'Failed to sign URLs' }, { status: 500 });
  }
}
