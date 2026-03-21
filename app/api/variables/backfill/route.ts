import { NextResponse } from 'next/server';
import { initDatabase, getAllCustomVariables, createCustomVariable, setJobVariableValues, sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    await initDatabase();

    // Step 1: Find or create "Runable Integration" boolean variable
    const allVars = await getAllCustomVariables();
    let variable = allVars.find(
      (v: { name: string }) => v.name.toLowerCase() === 'runable integration'
    );

    if (!variable) {
      variable = await createCustomVariable({
        name: 'Runable Integration',
        type: 'boolean',
        options: null,
        color: null,
      });
    }

    // Step 2: Find ALL template_jobs that have at least one published post
    const matchingJobs = await sql`
      SELECT DISTINCT tj.id
      FROM template_jobs tj
      WHERE EXISTS (
        SELECT 1 FROM posts p
        WHERE p.job_id = tj.id
          AND p.status IN ('published', 'partial')
      )
    ` as { id: string }[];

    // Step 3: Upsert job_variable_values for each matching job
    let jobsUpdated = 0;
    for (const job of matchingJobs) {
      await setJobVariableValues(job.id, [
        { variableId: variable.id, value: 'true' },
      ]);
      jobsUpdated++;
    }

    return NextResponse.json({
      variableId: variable.id,
      jobsFound: matchingJobs.length,
      jobsUpdated,
    });
  } catch (err) {
    console.error('Backfill error:', err);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
