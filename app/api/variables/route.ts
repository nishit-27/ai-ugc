import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, initDatabase, createCustomVariable, getAllCustomVariables } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDatabaseReady();
    const variables = await getAllCustomVariables();
    return NextResponse.json(variables);
  } catch (err) {
    console.error('List variables error:', err);
    return NextResponse.json({ error: 'Failed to list variables' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { name, type, options, color } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!['boolean', 'categorical', 'numeric'].includes(type)) {
      return NextResponse.json({ error: 'Type must be boolean, categorical, or numeric' }, { status: 400 });
    }

    if (type === 'categorical' && (!options || !Array.isArray(options) || options.length === 0)) {
      return NextResponse.json({ error: 'Categorical variables require at least one option' }, { status: 400 });
    }

    const variable = await createCustomVariable({ name, type, options: type === 'categorical' ? options : null, color });
    return NextResponse.json(variable);
  } catch (err: unknown) {
    console.error('Create variable error:', err);
    if (err instanceof Error && err.message?.includes('unique')) {
      return NextResponse.json({ error: 'A variable with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create variable' }, { status: 500 });
  }
}
