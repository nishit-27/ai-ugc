import { NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/db';
import { getSignedUrlFromPublicUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Job = {
  id: string;
  outputUrl?: string;
  [key: string]: unknown;
};

export async function GET() {
  try {
    const jobs = await getAllJobs() as Job[];

    // Convert outputUrl to signed URL for each completed job
    const jobsWithSignedUrls = await Promise.all(
      jobs.map(async (job) => {
        if (job.outputUrl && job.outputUrl.includes('storage.googleapis.com')) {
          try {
            const signedUrl = await getSignedUrlFromPublicUrl(job.outputUrl);
            return { ...job, signedUrl, outputUrl: job.outputUrl };
          } catch {
            return { ...job, signedUrl: job.outputUrl };
          }
        }
        return { ...job, signedUrl: job.outputUrl };
      })
    );

    return NextResponse.json(jobsWithSignedUrls);
  } catch (err) {
    console.error('Get jobs error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
