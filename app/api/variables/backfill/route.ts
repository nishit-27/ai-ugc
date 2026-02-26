import { NextResponse } from 'next/server';
import { initDatabase, getAllCustomVariables, createCustomVariable, setJobVariableValues, sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

    // Step 2: Find template_jobs that have an attach-video step in their pipeline
    const matchingJobs = await sql`
      SELECT id FROM template_jobs
      WHERE pipeline @> '[{"type": "attach-video"}]'::jsonb
    `;

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
