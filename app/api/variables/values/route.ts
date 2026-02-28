import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, initDatabase, getJobVariableValues, setJobVariableValues, sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const jobId = request.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId parameter is required' }, { status: 400 });
    }

    const values = await getJobVariableValues(jobId);
    return NextResponse.json(values);
  } catch (err) {
    console.error('Get variable values error:', err);
    return NextResponse.json({ error: 'Failed to get variable values' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { jobId, values } = body;

    if (!jobId || !values || !Array.isArray(values)) {
      return NextResponse.json({ error: 'jobId and values array are required' }, { status: 400 });
    }

    const result = await setJobVariableValues(jobId, values);

    // Also update any already-linked media items
    try {
      const linkedMedia = await sql`SELECT id FROM analytics_media_items WHERE template_job_id = ${jobId}`;
      for (const media of linkedMedia) {
        await sql`DELETE FROM media_variable_values WHERE media_item_id = ${media.id}`;
        await sql`
          INSERT INTO media_variable_values (media_item_id, variable_id, value)
          SELECT ${media.id}, variable_id, value
          FROM job_variable_values WHERE template_job_id = ${jobId}
          ON CONFLICT (media_item_id, variable_id) DO NOTHING
        `;
      }
    } catch (e) {
      console.error('Failed to sync media variable values:', e);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Set variable values error:', err);
    return NextResponse.json({ error: 'Failed to set variable values' }, { status: 500 });
  }
}
