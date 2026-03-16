import { NextResponse } from 'next/server';
import { initDatabase, getUnlinkedMediaItems, setMediaItemJobId, copyJobVariablesToMediaVariables } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/variables/backfill-media
 * One-time endpoint to link existing analytics_media_items to template_jobs
 * and copy variable values from job_variable_values to media_variable_values.
 */
export async function POST() {
  try {
    await initDatabase();

    const unlinked = await getUnlinkedMediaItems();

    let linked = 0;
    let variablesCopied = 0;

    for (const row of unlinked) {
      await setMediaItemJobId(row.media_item_id, row.job_id);
      linked++;

      const copied = await copyJobVariablesToMediaVariables(row.media_item_id, row.job_id);
      variablesCopied += copied;
    }

    return NextResponse.json({
      success: true,
      totalUnlinked: unlinked.length,
      linked,
      variablesCopied,
    });
  } catch (err) {
    console.error('Backfill media error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
