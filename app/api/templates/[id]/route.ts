import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, getTemplateJob, deleteTemplateJob } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const job = await getTemplateJob(id);
    if (!job) {
      return NextResponse.json({ error: 'Template job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (err) {
    console.error('Get template job error:', err);
    return NextResponse.json({ error: 'Failed to get template job' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const job = await getTemplateJob(id);
    if (!job) {
      return NextResponse.json({ error: 'Template job not found' }, { status: 404 });
    }

    if (job.status !== 'queued') {
      return NextResponse.json(
        { error: 'Only queued jobs can be deleted' },
        { status: 409 }
      );
    }

    await deleteTemplateJob(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete template job error:', err);
    return NextResponse.json({ error: 'Failed to delete template job' }, { status: 500 });
  }
}
