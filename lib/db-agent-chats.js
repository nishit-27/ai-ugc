import { db } from './drizzle';
import { agentChats, agentChatMessages } from './schema';
import { eq, asc } from 'drizzle-orm';
import { sql as rawSql } from './db-client';

// ── Self-contained DDL so the feature works even if the main initDatabase() ──
// ── is blocked by an unrelated migration error.                              ──

let _tablesReady = null;

export async function ensureAgentChatsTables() {
  if (_tablesReady) return _tablesReady;
  _tablesReady = (async () => {
    await rawSql`
      CREATE TABLE IF NOT EXISTS agent_chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL DEFAULT 'New chat',
        created_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await rawSql`CREATE INDEX IF NOT EXISTS idx_agent_chats_updated_at ON agent_chats(updated_at DESC)`;

    await rawSql`
      CREATE TABLE IF NOT EXISTS agent_chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID NOT NULL REFERENCES agent_chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tool_calls JSONB,
        created_by TEXT,
        created_by_name TEXT,
        created_by_image TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await rawSql`ALTER TABLE agent_chat_messages ADD COLUMN IF NOT EXISTS created_by TEXT`;
    await rawSql`ALTER TABLE agent_chat_messages ADD COLUMN IF NOT EXISTS created_by_name TEXT`;
    await rawSql`ALTER TABLE agent_chat_messages ADD COLUMN IF NOT EXISTS created_by_image TEXT`;
    await rawSql`CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_chat_id ON agent_chat_messages(chat_id, created_at)`;
  })().catch((err) => {
    _tablesReady = null;
    throw err;
  });
  return _tablesReady;
}

// ── Chats ──

export async function listAgentChats({ limit = 20, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  return rawSql`
    SELECT
      c.id,
      c.title,
      c.created_by      AS "createdBy",
      c.created_at      AS "createdAt",
      c.updated_at      AS "updatedAt",
      COALESCE(p.participants, '[]'::jsonb) AS participants,
      COALESCE(mc.message_count, 0)         AS "messageCount"
    FROM agent_chats c
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('email', email, 'name', name, 'image', image)) AS participants
      FROM (
        SELECT DISTINCT ON (created_by)
          created_by       AS email,
          created_by_name  AS name,
          created_by_image AS image
        FROM agent_chat_messages
        WHERE chat_id = c.id AND role = 'user' AND created_by IS NOT NULL
        ORDER BY created_by, created_at DESC
      ) t
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS message_count
      FROM agent_chat_messages
      WHERE chat_id = c.id
    ) mc ON TRUE
    ORDER BY c.updated_at DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `;
}

export async function countAgentChats() {
  const rows = await rawSql`SELECT COUNT(*)::int AS n FROM agent_chats`;
  return rows[0]?.n ?? 0;
}

export async function getAgentChat(id) {
  const rows = await db.select().from(agentChats).where(eq(agentChats.id, id));
  return rows[0] || null;
}

export async function createAgentChat({ createdBy, title }) {
  // Raw SQL to avoid any Drizzle column-mapping surprises.
  const rows = await rawSql`
    INSERT INTO agent_chats (created_by, title)
    VALUES (${createdBy || null}, ${title || 'New chat'})
    RETURNING
      id,
      title,
      created_by AS "createdBy",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;
  return rows[0];
}

export async function updateAgentChatTitle(id, title) {
  await rawSql`UPDATE agent_chats SET title = ${title}, updated_at = NOW() WHERE id = ${id}`;
}

export async function touchAgentChat(id) {
  await rawSql`UPDATE agent_chats SET updated_at = NOW() WHERE id = ${id}`;
}

export async function deleteAgentChat(id) {
  await db.delete(agentChats).where(eq(agentChats.id, id));
}

// ── Messages ──

export async function getAgentChatMessages(chatId) {
  return db
    .select()
    .from(agentChatMessages)
    .where(eq(agentChatMessages.chatId, chatId))
    .orderBy(asc(agentChatMessages.createdAt));
}

export async function addAgentChatMessage({
  chatId,
  role,
  content,
  toolCalls,
  createdBy,
  createdByName,
  createdByImage,
}) {
  const payload = toolCalls ? JSON.stringify(toolCalls) : null;
  const rows = await rawSql`
    INSERT INTO agent_chat_messages (chat_id, role, content, tool_calls, created_by, created_by_name, created_by_image)
    VALUES (
      ${chatId},
      ${role},
      ${content ?? ''},
      ${payload}::jsonb,
      ${createdBy || null},
      ${createdByName || null},
      ${createdByImage || null}
    )
    RETURNING
      id,
      chat_id          AS "chatId",
      role,
      content,
      tool_calls       AS "toolCalls",
      created_by       AS "createdBy",
      created_by_name  AS "createdByName",
      created_by_image AS "createdByImage",
      created_at       AS "createdAt"
  `;
  return rows[0];
}
