import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { setLearnedLimit, getLearnedLimitsAll } from '@/lib/db-late-api-key-limits';

export const dynamic = 'force-dynamic';

export async function GET() {
  const map = await getLearnedLimitsAll();
  const out: Record<number, number> = {};
  for (const [k, v] of map) out[k] = v;
  return NextResponse.json({ limits: out });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { apiKeyIndex?: number; max?: number };
  const { apiKeyIndex, max } = body;

  if (
    typeof apiKeyIndex !== 'number' ||
    apiKeyIndex < 0 ||
    apiKeyIndex >= config.LATE_API_KEYS.length
  ) {
    return NextResponse.json(
      { error: `apiKeyIndex must be 0..${config.LATE_API_KEYS.length - 1}` },
      { status: 400 },
    );
  }
  if (typeof max !== 'number' || !Number.isFinite(max) || max < 1) {
    return NextResponse.json({ error: 'max must be a positive number' }, { status: 400 });
  }

  await setLearnedLimit(apiKeyIndex, Math.floor(max));
  return NextResponse.json({ ok: true, apiKeyIndex, max: Math.floor(max) });
}
