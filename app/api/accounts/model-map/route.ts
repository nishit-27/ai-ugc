import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getAccountToModelMap } from '@/lib/db';

export const dynamic = 'force-dynamic';

// In-memory cache (5 min TTL)
let cached: { ts: number; data: Record<string, { modelId: string; modelName: string }> } | null = null;
const CACHE_TTL = 5 * 60_000;

export async function GET() {
  try {
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      });
    }

    await ensureDatabaseReady();
    const map = await getAccountToModelMap() as Record<string, { modelId: string; modelName: string }>;

    cached = { ts: Date.now(), data: map };
    return NextResponse.json(map, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    return NextResponse.json({}, { status: 200 });
  }
}
