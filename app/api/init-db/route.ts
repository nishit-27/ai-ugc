import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await initDatabase();
    return NextResponse.json({ success: true, message: 'Database initialized successfully' });
  } catch (err) {
    console.error('Database initialization error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await initDatabase();
    return NextResponse.json({ success: true, message: 'Database initialized successfully' });
  } catch (err) {
    console.error('Database initialization error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
