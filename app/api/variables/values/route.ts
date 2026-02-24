import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, initDatabase, getJobVariableValues, setJobVariableValues } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const jobId = request.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId parameter is required' }, { status: 400 });
    }

    const values = await getJobVariableValues(jobId);
    return NextResponse.json(values);
  } catch (err) {
    console.error('Get variable values error:', err);
    return NextResponse.json({ error: 'Failed to get variable values' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { jobId, values } = body;

    if (!jobId || !values || !Array.isArray(values)) {
      return NextResponse.json({ error: 'jobId and values array are required' }, { status: 400 });
    }

    const result = await setJobVariableValues(jobId, values);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Set variable values error:', err);
    return NextResponse.json({ error: 'Failed to set variable values' }, { status: 500 });
  }
}
