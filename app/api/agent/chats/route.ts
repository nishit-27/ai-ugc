import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  ensureDatabaseReady,
  initDatabase,
  listAgentChats,
  countAgentChats,
  createAgentChat,
  ensureAgentChatsTables,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureDatabaseReady();
    await ensureAgentChatsTables();
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const [chats, total] = await Promise.all([
      listAgentChats({ limit, offset }),
      countAgentChats(),
    ]);
    return NextResponse.json({ chats, total, limit, offset });
  } catch (err) {
    console.error('[agent-chats] GET failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to list chats: ${message}` }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await initDatabase();
    await ensureAgentChatsTables();
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const chat = await createAgentChat({
      createdBy: session.user.email || null,
      title: body.title || 'New chat',
    });
    return NextResponse.json({ chat });
  } catch (err) {
    console.error('[agent-chats] POST failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create chat: ${message}` }, { status: 500 });
  }
}
