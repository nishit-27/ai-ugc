import { NextResponse } from 'next/server';
import { initDatabase, getGenerationRequestStats, getTemplateJobsWithRelations } from '@/lib/db';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

async function fetchFalPricing() {
  const falKey = config.FAL_KEY;
  if (!falKey) return [];
  try {
    const endpoints = [
      'fal-ai/nano-banana-2/edit',
      'fal-ai/kling-video/v2.6/standard/motion-control',
      'fal-ai/veo3.1/image-to-video',
    ];
    const params = endpoints.map((id) => `endpoint_id=${encodeURIComponent(id)}`).join('&');
    const res = await fetch(`https://api.fal.ai/v1/models/pricing?${params}`, {
      headers: { Authorization: `Key ${falKey}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.prices || [];
  } catch {
    return [];
  }
}

async function enrichJobData(byJob: Array<{ job_id: string; [k: string]: unknown }>) {
  if (byJob.length === 0) return byJob;
  const jobIds = byJob.map((j) => j.job_id).filter(Boolean);
  if (jobIds.length === 0) return byJob;

  try {
    const jobs = await getTemplateJobsWithRelations(jobIds);
    const jobMap = new Map(jobs.map((j: Record<string, unknown>) => [j.id, j]));
    return byJob.map((entry) => {
      const job = jobMap.get(entry.job_id) as Record<string, unknown> | undefined;
      return {
        ...entry,
        job_name: job?.name || null,
        job_status: job?.job_status || null,
        model_name: job?.model_name || null,
        batch_name: job?.batch_name || null,
        is_master: job?.is_master || false,
        job_created_by: job?.created_by || null,
      };
    });
  } catch {
    return byJob;
  }
}

export async function GET(req: Request) {
  try {
    await initDatabase();
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || '30d') as '24h' | '7d' | '30d';
    const from = searchParams.get('from') || null;
    const to = searchParams.get('to') || null;

    const [stats, falPrices] = await Promise.all([
      getGenerationRequestStats({ period, from, to }),
      fetchFalPricing(),
    ]);

    const enrichedByJob = await enrichJobData(stats.byJob);

    return NextResponse.json({ ...stats, byJob: enrichedByJob, falPrices });
  } catch (error) {
    console.error('Pricing stats error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
