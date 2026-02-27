import { NextRequest, NextResponse } from 'next/server';

/**
 * Signed URL endpoint — kept for backward compatibility.
 * All URLs are now R2 public, so we just return them as-is.
 */

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }
  return NextResponse.json({ signedUrl: url });
}

export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json() as { urls?: string[] };
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array is required' }, { status: 400 });
    }

    const signed: Record<string, string> = {};
    for (const url of urls.slice(0, 100)) {
      signed[url] = url;
    }

    return NextResponse.json({ signed });
  } catch (err) {
    console.error('Batch sign URLs error:', err);
    return NextResponse.json({ error: 'Failed to sign URLs' }, { status: 500 });
  }
}
