import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getPipelineBatch, updateMasterConfig } from '@/lib/db';
import type { MasterConfig } from '@/types';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await initDatabase();

    const batch = await getPipelineBatch(id);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }
    if (!batch.isMaster || !batch.masterConfig) {
      return NextResponse.json({ error: 'Not a master batch' }, { status: 400 });
    }

    const body = await request.json();
    const { caption, publishMode, scheduledFor, timezone } = body as {
      caption?: string;
      publishMode?: MasterConfig['publishMode'];
      scheduledFor?: string;
      timezone?: string;
    };

    const updated: MasterConfig = { ...batch.masterConfig };

    if (caption !== undefined) updated.caption = caption;
    if (publishMode !== undefined) updated.publishMode = publishMode;
    if (scheduledFor !== undefined) updated.scheduledFor = scheduledFor;
    if (timezone !== undefined) updated.timezone = timezone;

    const result = await updateMasterConfig(id, updated);
    return NextResponse.json({ batch: result });
  } catch (error) {
    console.error('Failed to update master config:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update' },
      { status: 500 }
    );
  }
}
