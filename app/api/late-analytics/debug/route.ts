import { NextResponse } from 'next/server';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || '/analytics?limit=2';

    const results = await fetchFromAllKeys<unknown>(endpoint);

    return NextResponse.json({
      endpoint,
      keyCount: results.length,
      responses: results.map(({ apiKeyIndex, data }) => {
        const d = data as Record<string, unknown> | null;
        return {
          apiKeyIndex,
          topLevelKeys: d && typeof d === 'object' ? Object.keys(d) : null,
          // Show first items of arrays, not the whole thing
          preview: d && typeof d === 'object' ? Object.fromEntries(
            Object.entries(d).map(([k, v]) => {
              if (Array.isArray(v)) return [k, { length: v.length, first: v[0] }];
              return [k, v];
            })
          ) : d,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message, stack: (error as Error).stack }, { status: 500 });
  }
}
