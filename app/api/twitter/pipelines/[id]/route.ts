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
  const pipeline = await updateTwitterPipeline(id, {
    ...body,
    scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : body.scheduledFor,
    completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
  });

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
