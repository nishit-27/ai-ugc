import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  ensureAgentChatsTables,
  getAgentChat,
  getAgentChatMessages,
  deleteAgentChat,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureAgentChatsTables();
    const { id } = await params;
    const chat = await getAgentChat(id);
    if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const messages = await getAgentChatMessages(id);
    return NextResponse.json({ chat, messages });
  } catch (err) {
    console.error('[agent-chat] GET failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to load chat: ${message}` }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureAgentChatsTables();
    const { id } = await params;
    await deleteAgentChat(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[agent-chat] DELETE failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to delete chat: ${message}` }, { status: 500 });
  }
}
