import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getTemplateJob, updateTemplateJobOverrides } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await initDatabase();

    const job = await getTemplateJob(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const body = await request.json();
    const { captionOverride, publishModeOverride, scheduledForOverride, timezoneOverride } = body as {
      captionOverride?: string | null;
      publishModeOverride?: 'now' | 'schedule' | 'queue' | 'draft' | null;
      scheduledForOverride?: string | null;
      timezoneOverride?: string | null;
    };

    const result = await updateTemplateJobOverrides(id, {
      captionOverride: captionOverride !== undefined ? captionOverride : undefined,
      publishModeOverride: publishModeOverride !== undefined ? publishModeOverride : undefined,
      scheduledForOverride: scheduledForOverride !== undefined ? scheduledForOverride : undefined,
      timezoneOverride: timezoneOverride !== undefined ? timezoneOverride : undefined,
    });

    return NextResponse.json({ job: result });
  } catch (error) {
    console.error('Failed to update job overrides:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update' },
      { status: 500 }
    );
  }
}
