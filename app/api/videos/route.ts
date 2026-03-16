import { NextRequest, NextResponse } from 'next/server';
import {
  ensureDatabaseReady,
  getAllMediaFiles,
  getAllModels,
  getCompletedJobVideos,
  getCompletedTemplateJobVideos,
} from '@/lib/db';

type MediaFile = {
  filename: string;
  gcsUrl: string;
  fileSize: number | null;
  createdAt: string | null;
  jobId: string | null;
};

type OutputVideo = {
  name: string;
  path: string;
  url: string;
  size: number | null;
  created: string | Date | null;
  jobId: string | null;
  createdBy?: string | null;
  modelId?: string | null;
  modelName?: string | null;
};

function toMillis(value?: string | Date | null): number {
  if (!value) return 0;
  const t = +new Date(value);
  return Number.isFinite(t) ? t : 0;
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'video.mp4';
  } catch {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'video.mp4';
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();

    const mode = request.nextUrl.searchParams.get('mode') || 'all';

    // Keep default behavior for existing consumers (e.g. Create Post modal).
    if (mode !== 'generated') {
      const videos = await getAllMediaFiles('video') as (MediaFile | null)[];

      const formattedVideos = videos
        .filter((v): v is MediaFile => v !== null)
        .map((v) => ({
          name: v.filename,
          path: v.gcsUrl,
          url: v.gcsUrl,
          size: v.fileSize,
          created: v.createdAt,
          jobId: v.jobId,
        }));

      return NextResponse.json({ videos: formattedVideos });
    }

    // Fetch only completed jobs with output URLs + media metadata + models in parallel.
    const [mediaRows, jobs, templateJobs, models] = await Promise.all([
      getAllMediaFiles('video') as Promise<(MediaFile | null)[]>,
      getCompletedJobVideos(),
      getCompletedTemplateJobVideos(),
      getAllModels(),
    ]);

    const mediaByUrl = new Map<string, MediaFile>();
    for (const row of mediaRows) {
      if (!row?.gcsUrl) continue;
      mediaByUrl.set(row.gcsUrl, row);
    }

    const modelNameById = new Map<string, string>();
    for (const model of models) {
      if (!model?.id) continue;
      modelNameById.set(model.id, model.name || 'Unknown model');
    }

    const byUrl = new Map<string, OutputVideo>();

    for (const job of jobs) {
      if (!job.outputUrl) continue;
      const media = mediaByUrl.get(job.outputUrl);
      const created = job.completedAt || job.createdAt || media?.createdAt || null;
      const next: OutputVideo = {
        name: media?.filename || filenameFromUrl(job.outputUrl),
        path: job.outputUrl,
        url: job.outputUrl,
        size: media?.fileSize ?? null,
        created,
        jobId: job.id,
        createdBy: job.createdBy || null,
        modelId: null,
        modelName: null,
      };

      const existing = byUrl.get(job.outputUrl);
      if (!existing || toMillis(created) >= toMillis(existing.created)) {
        byUrl.set(job.outputUrl, next);
      }
    }

    for (const job of templateJobs) {
      if (!job.outputUrl) continue;
      const media = mediaByUrl.get(job.outputUrl);
      const created = job.completedAt || job.createdAt || media?.createdAt || null;
      const next: OutputVideo = {
        name: media?.filename || filenameFromUrl(job.outputUrl),
        path: job.outputUrl,
        url: job.outputUrl,
        size: media?.fileSize ?? null,
        created,
        jobId: job.id,
        createdBy: job.createdBy || null,
        modelId: job.modelId || null,
        modelName: job.modelId ? (modelNameById.get(job.modelId) || null) : null,
      };

      const existing = byUrl.get(job.outputUrl);
      if (!existing || toMillis(created) >= toMillis(existing.created)) {
        byUrl.set(job.outputUrl, next);
      }
    }

    const generatedVideos = [...byUrl.values()].sort((a, b) => toMillis(b.created) - toMillis(a.created));

    return NextResponse.json({ videos: generatedVideos });
  } catch (err) {
    console.error('Get videos error:', err);
    return NextResponse.json({ videos: [] });
  }
}
