import { NextRequest, NextResponse } from 'next/server';

/** URLs are now R2 public — return as-is. Kept for backward compatibility. */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    return NextResponse.json({ signedUrl: url });
  } catch (err) {
    console.error('Sign music URL error:', err);
    return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 });
  }
}
