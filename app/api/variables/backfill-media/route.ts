import { NextResponse } from 'next/server';
import { initDatabase, sql } from '@/lib/db';

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

    // Find all unlinked media items that have a matching post
    const unlinked = await sql`
      SELECT ami.id AS media_item_id, ami.external_id, p.job_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      JOIN posts p ON p.external_post_id = ami.external_id
        AND p.late_account_id = aa.late_account_id
      WHERE ami.template_job_id IS NULL
        AND p.job_id IS NOT NULL
    `;

    let linked = 0;
    let variablesCopied = 0;

    for (const row of unlinked) {
      // Set template_job_id
      await sql`UPDATE analytics_media_items SET template_job_id = ${row.job_id} WHERE id = ${row.media_item_id}`;
      linked++;

      // Copy variable values
      const inserted = await sql`
        INSERT INTO media_variable_values (media_item_id, variable_id, value)
        SELECT ${row.media_item_id}, variable_id, value
        FROM job_variable_values WHERE template_job_id = ${row.job_id}
        ON CONFLICT (media_item_id, variable_id) DO NOTHING
      `;
      variablesCopied += inserted.length || 0;
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
