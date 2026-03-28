import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureDatabaseReady, initDatabase } from '@/lib/db';
import {
  createTwitterPipeline,
  getAllTwitterPipelines,
} from '@/lib/db-twitter-pipelines';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureDatabaseReady();
  const pipelines = await getAllTwitterPipelines();
  return NextResponse.json({ pipelines });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await initDatabase();

  const body = await req.json();
  const { name, steps, accountIds, scheduledFor, timezone } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const pipeline = await createTwitterPipeline({
    name,
    steps: steps || [],
    accountIds: accountIds || [],
    scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
    timezone,
    createdBy: session.user?.email || undefined,
  });

  return NextResponse.json({ pipeline }, { status: 201 });
}
