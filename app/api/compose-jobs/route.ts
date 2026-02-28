import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getAllPipelineBatches, getAllTemplateJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDatabaseReady();

    const [batches, allJobs] = await Promise.all([
      getAllPipelineBatches(),
      getAllTemplateJobs(),
    ]);

    // Standalone jobs: completed, have outputUrl, not part of a batch
    const standaloneJobs = allJobs.filter(
      (j: { pipelineBatchId?: string | null; status?: string; outputUrl?: string | null }) =>
        !j.pipelineBatchId && j.status === 'completed' && j.outputUrl,
    );

    return NextResponse.json({ batches, standaloneJobs });
  } catch (err) {
    console.error('Failed to fetch compose jobs:', err);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}
