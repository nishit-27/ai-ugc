import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureDatabaseReady, initDatabase } from '@/lib/db';
import {
  getTwitterPipeline,
  updateTwitterPipeline,
  deleteTwitterPipeline,
} from '@/lib/db-twitter-pipelines';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await ensureDatabaseReady();
  const pipeline = await getTwitterPipeline(id);

  if (!pipeline) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ pipeline });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await initDatabase();

  const body = await req.json();
  // Whitelist updatable fields — passing unknown keys into the Drizzle .set()
  // would throw, and we never let the client write status/results directly.
  const update: Parameters<typeof updateTwitterPipeline>[1] = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.steps !== undefined) update.steps = body.steps;
  if (body.accountIds !== undefined) update.accountIds = body.accountIds;
  if (body.modelIds !== undefined) update.modelIds = body.modelIds;
  if (body.publishMode !== undefined) update.publishMode = body.publishMode;
  if (body.timezone !== undefined) update.timezone = body.timezone;
  if (body.scheduledFor !== undefined) {
    update.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  }

  const pipeline = await updateTwitterPipeline(id, update);

  if (!pipeline) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ pipeline });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await initDatabase();
  await deleteTwitterPipeline(id);

  return NextResponse.json({ success: true });
}
