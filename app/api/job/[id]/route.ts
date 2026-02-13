import { NextRequest, NextResponse } from 'next/server';
import { getJob, deleteJob, getAllMediaFiles } from '@/lib/db';
import { deleteFile } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (err) {
    console.error('Get job error:', err);
    return NextResponse.json({ error: 'Failed to get job' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Delete output video from GCS if exists
    if (job.outputUrl) {
      await deleteFile(job.outputUrl);
    }

    // Delete job from database
    await deleteJob(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete job error:', err);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}
