import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-client';
import { ensureDatabaseReady } from '@/lib/db-schema';

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
    const rows = await sql`
      SELECT mam.late_account_id, mam.model_id, m.name as model_name
      FROM model_account_mappings mam
      JOIN models m ON m.id = mam.model_id
    `;

    const map: Record<string, { modelId: string; modelName: string }> = {};
    for (const row of rows) {
      map[row.late_account_id] = {
        modelId: row.model_id,
        modelName: row.model_name,
      };
    }

    cached = { ts: Date.now(), data: map };
    return NextResponse.json(map, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    return NextResponse.json({}, { status: 200 });
  }
}
