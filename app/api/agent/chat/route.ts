import { NextResponse } from 'next/server';
import { GoogleGenAI, type FunctionDeclaration, type Part } from '@google/genai';
import { neon } from '@neondatabase/serverless';
import { config } from '@/lib/config';
import { auth } from '@/lib/auth';
import {
  ensureAgentChatsTables,
  getAgentChat,
  getAgentChatMessages,
  addAgentChatMessage,
  updateAgentChatTitle,
  touchAgentChat,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_ID = process.env.GEMINI_CHAT_MODEL || 'gemini-3-pro-preview';

const PRODUCT_CONTEXT = `
You are an expert data analyst embedded inside "AI UGC" — an internal tool built by the Runable team
(runable.com) for generating, publishing, and analyzing AI-generated short-form videos (TikTok,
Instagram Reels, YouTube Shorts).

## Product workflow (for your analyses)

1. The team defines "Models" (AI personas) and uploads reference images for each (tables: models,
   model_images, model_group_memberships).
2. A "Master Pipeline" creates a "pipeline_batch" (parent container) and spawns one "template_job"
   per selected model. A pipeline is a JSON array of steps: video-generation,
   batch-video-generation, text-overlay, bg-music, attach-video, compose. Each template_job stores
   its pipeline, status, step progress, outputUrl, and the model used.
3. Completed videos are published to social platforms via Zernio/Late API → rows land in the
   "posts" table (accountId, lateAccountId, caption, platform, status, scheduledFor, publishedAt,
   platformPostUrl, latePostId). Posts can be scheduled or published-now.
4. Analytics are pulled back in from TikTok/Instagram/YouTube and stored. **These are the
   authoritative tables for every performance question** — the "/analytics" and "/late-analytics"
   dashboards both read from them:
     - analytics_accounts          → per-account totals. Columns: platform, username, display_name,
                                     account_id, late_account_id, profile_url, followers,
                                     total_views, total_likes, total_comments, total_shares,
                                     engagement_rate, last_synced_at.
     - analytics_account_snapshots → daily snapshots per account (same metrics + snapshot_date),
                                     use for follower/view growth trends.
     - analytics_media_items       → one row per posted video on a platform. Columns: account_id,
                                     platform, external_id, url, caption, published_at, views,
                                     likes, comments, shares, saves, engagement_rate, template_job_id
                                     (joins back to the job we produced).
     - analytics_media_snapshots   → daily snapshots per video (views/likes/etc + snapshot_date).
5. Custom variables (custom_variables) are key/value tags that attach either to a template_job
   (job_variable_values) or to a posted media item (media_variable_values). Common variables are
   things like "caption_style", "hook_type", "cta", "music_genre" — teams use these to A/B-test
   what's working.
6. analytics_media_items.template_job_id is the JOIN bridge between produced video → posted video →
   real-world views. Use it for caption / timing / variable correlation.
7. The "posts" table tracks what we *scheduled* / *published* (platform_post_url, late_post_id,
   scheduled_for, published_at, caption, status). For engagement numbers always JOIN to
   analytics_media_items on analytics_media_items.external_id = posts.external_post_id (or on
   template_job_id).

## Common questions → the right query shape

  - "Best-performing account" → SELECT platform, username, profile_url, followers, total_views,
      engagement_rate FROM analytics_accounts ORDER BY total_views DESC (or engagement_rate DESC)
      LIMIT 10. Decide which metric (views vs engagement_rate vs follower growth) actually answers
      the question and say which you picked.
  - "Top videos" → analytics_media_items JOIN analytics_accounts ON account_id, ORDER BY views
      DESC; include caption, url (the direct platform URL), platform, published_at.
  - "Best posting time" → EXTRACT(HOUR FROM published_at AT TIME ZONE 'UTC'),
      EXTRACT(DOW FROM published_at), AVG(views) — bucket + order.
  - "Growth" → diff analytics_account_snapshots across two snapshot_date values.

## Formatting rules (STRICT)

  - When citing an account, use \`[@username](profile_url)\` where \`profile_url\` is the EXACT
    value from analytics_accounts.profile_url. Do NOT construct URLs yourself.
  - When citing a video/post, use \`[caption preview…](url)\` where \`url\` is the EXACT value
    from analytics_media_items.url (or posts.platform_post_url). Never guess, never build URLs
    from handles. If you don't have the URL column in your result, re-run the SELECT to include it.
  - If a URL column is null in the DB, mention the handle + platform in plain text and explicitly
    say "(no direct link stored)".
  - NEVER output raw URLs wrapped as \`[url](url)\` or prefixed with 🔗. One clean Markdown link
    per citation.
  - Use a short numbered list when ranking items. Put the key metric at the start of each bullet
    (views, engagement rate) so humans can scan.

## Web tools

You also have Google Search and URL-context grounding. Use them when:
  - The user asks about something outside the DB (trends, competitors, platform updates).
  - You need to verify/complete a profile link we don't have stored.
  - The user asks "look up X on TikTok/Instagram" etc.
Do NOT use web search to make up numbers for things that should come from our DB.

## Your job

When the user asks a question, INVESTIGATE the database before answering:
  - Start by listing tables or reading schemas if you need to.
  - Run SELECT queries to pull real numbers.
  - NEVER make up numbers — every claim must be backed by a query result.
  - Think about the right dimensions: posting time (hour-of-day, day-of-week from published_at),
    caption content (length, keywords, emojis), batch (pipeline_batches.name, batch-level avg
    views), model, platform, custom variable values.
  - Prefer aggregations (AVG, PERCENTILE_CONT, COUNT) over raw rows. If you need raw rows, LIMIT
    them aggressively.
  - After gathering evidence, give a sharp, opinionated answer with numbers + actionable insight.

## SQL rules

  - You can ONLY run SELECT/WITH statements. Any INSERT/UPDATE/DELETE/DDL will be rejected.
  - Postgres dialect (Neon). Use EXTRACT, DATE_TRUNC, FILTER (WHERE ...), PERCENTILE_CONT, etc.
  - Always LIMIT when selecting rows. Prefer LIMIT 50 for previews; unlimited for aggregates.
  - Wrap long queries in CTEs for readability.
  - Column & table names are snake_case in the DB (even though the Drizzle schema exposes camelCase).

Answer in crisp, terse markdown. Lead with the insight, then the supporting numbers.
`.trim();

// ── SQL safety ──────────────────────────────────────────────────────────────

const READ_ONLY_FIRST_TOKENS = /^\s*(select|with|explain)\b/i;
const FORBIDDEN_RE = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|vacuum|reindex|copy|call|do|merge)\b/i;

function validateReadOnlySql(raw: string): { ok: true; sql: string } | { ok: false; reason: string } {
  const stripped = raw
    .replace(/--[^\n]*\n?/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .replace(/;+\s*$/g, '');
  if (!stripped) return { ok: false, reason: 'empty query' };
  if (stripped.includes(';')) return { ok: false, reason: 'multiple statements not allowed' };
  if (!READ_ONLY_FIRST_TOKENS.test(stripped)) return { ok: false, reason: 'only SELECT/WITH/EXPLAIN allowed' };
  if (FORBIDDEN_RE.test(stripped)) return { ok: false, reason: 'write/DDL keyword detected' };
  return { ok: true, sql: stripped };
}

// ── Tool implementations ────────────────────────────────────────────────────

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return neon(process.env.DATABASE_URL);
}

async function listTables() {
  const sql = getSql();
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  return { tables: rows.map((r: Record<string, unknown>) => r.table_name as string) };
}

async function describeTable(tableName: string) {
  const sql = getSql();
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
  const countRows = await sql`
    SELECT reltuples::bigint AS approx_row_count
    FROM pg_class WHERE relname = ${tableName}
  `;
  return {
    table: tableName,
    approxRowCount: countRows[0]?.approx_row_count ?? null,
    columns: cols,
  };
}

async function runSql(query: string, limit = 200) {
  const check = validateReadOnlySql(query);
  if (!check.ok) return { error: `Query rejected: ${check.reason}` };

  const sql = getSql();
  const bounded = `WITH __agent_q AS (${check.sql}) SELECT * FROM __agent_q LIMIT ${limit}`;
  try {
    const started = Date.now();
    const rows = await sql.query(bounded);
    const ms = Date.now() - started;
    return { rowCount: rows.length, durationMs: ms, rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Tool declarations ───────────────────────────────────────────────────────

const tools: FunctionDeclaration[] = [
  {
    name: 'list_tables',
    description: 'List every table in the public schema. Use this first when you need to discover what data exists.',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'describe_table',
    description: 'Return the columns, types, nullability, and approximate row count for a table.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'The snake_case table name, e.g. analytics_media_items' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'run_sql',
    description: 'Run a read-only Postgres query (SELECT/WITH/EXPLAIN only). Results are capped by the `limit` arg (default 200). Use aggregations; do not pull more rows than you need to reason about.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A single SELECT/WITH/EXPLAIN statement. No trailing semicolon, no multiple statements.' },
        limit: { type: 'integer', description: 'Max rows to return (1-1000). Default 200.' },
      },
      required: ['query'],
    },
  },
];

type ToolArgs = Record<string, unknown>;

async function executeTool(name: string, args: ToolArgs): Promise<Record<string, unknown>> {
  try {
    if (name === 'list_tables') return await listTables();
    if (name === 'describe_table') return await describeTable(String(args.table_name));
    if (name === 'run_sql') {
      const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(1000, args.limit)) : 200;
      return await runSql(String(args.query), limit);
    }
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Types for request payload ───────────────────────────────────────────────

type HistoryEntry = { role: 'user' | 'model'; parts: Part[] };

type ToolCallLog = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 60) return clean;
  return clean.slice(0, 57) + '…';
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!config.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server' }, { status: 500 });
  }

  const body = (await req.json()) as { chatId?: string; userMessage?: string };
  const chatId = body.chatId?.trim();
  const userMessage = body.userMessage?.trim();

  if (!chatId) return NextResponse.json({ error: 'chatId required' }, { status: 400 });
  if (!userMessage) return NextResponse.json({ error: 'userMessage required' }, { status: 400 });

  await ensureAgentChatsTables();
  const chat = await getAgentChat(chatId);
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  const userEmail = session.user.email || null;
  const userName = session.user.name || null;
  const userImage = session.user.image || null;

  // Persist the user message and auto-title the chat if this is the first message.
  const priorMessages = await getAgentChatMessages(chatId);
  await addAgentChatMessage({
    chatId,
    role: 'user',
    content: userMessage,
    toolCalls: null,
    createdBy: userEmail,
    createdByName: userName,
    createdByImage: userImage,
  });
  if (priorMessages.length === 0 || chat.title === 'New chat' || !chat.title) {
    await updateAgentChatTitle(chatId, makeTitle(userMessage));
  } else {
    await touchAgentChat(chatId);
  }

  // Build Gemini history from prior DB messages + the new user message.
  const history: HistoryEntry[] = [];
  for (const m of priorMessages) {
    history.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    });
  }
  history.push({ role: 'user', parts: [{ text: userMessage }] });

  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const toolCallLog: ToolCallLog[] = [];
      let assistantText = '';

      try {
        let steps = 0;
        const MAX_STEPS = 25;

        while (steps < MAX_STEPS) {
          steps += 1;

          const streamResp = await ai.models.generateContentStream({
            model: MODEL_ID,
            contents: history as unknown as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
            config: {
              systemInstruction: PRODUCT_CONTEXT,
              tools: [
                { functionDeclarations: tools },
                { googleSearch: {} },
                { urlContext: {} },
              ],
              temperature: 0.2,
            },
          });

          // Collect parts across all chunks so we can replay the full turn back
          // to Gemini on the next loop iteration (signatures + thoughts preserved).
          const turnParts: Part[] = [];
          let turnText = '';
          const callsThisTurn: Array<{ id?: string; name: string; args: ToolArgs }> = [];

          for await (const chunk of streamResp) {
            const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
            for (const p of chunkParts) {
              if (p.functionCall) {
                turnParts.push(p);
                callsThisTurn.push({
                  id: p.functionCall.id,
                  name: p.functionCall.name ?? '',
                  args: (p.functionCall.args ?? {}) as ToolArgs,
                });
                continue;
              }
              if (typeof p.text === 'string' && p.text.length > 0) {
                // Stream the text delta to the client as it arrives.
                send({ type: 'text', text: p.text });
                turnText += p.text;
                // Merge consecutive text parts to keep history compact.
                const last = turnParts[turnParts.length - 1];
                if (last && typeof last.text === 'string' && !last.functionCall) {
                  last.text = (last.text ?? '') + p.text;
                  if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature;
                } else {
                  turnParts.push(p);
                }
                continue;
              }
              // Other part types (thought, fileData, etc.) — preserve verbatim.
              turnParts.push(p);
            }
          }

          if (callsThisTurn.length === 0) {
            if (turnText) assistantText = turnText;
            break;
          }

          // Echo the model turn back verbatim.
          history.push({ role: 'model', parts: turnParts });

          const responseParts: Part[] = [];
          for (const call of callsThisTurn) {
            send({ type: 'tool_call', name: call.name, args: call.args });
            const toolResult = await executeTool(call.name, call.args);
            const summary = summarizeForStream(toolResult);
            send({ type: 'tool_result', name: call.name, result: summary });
            toolCallLog.push({ name: call.name, args: call.args, result: summary });
            responseParts.push({
              functionResponse: { name: call.name, id: call.id, response: toolResult },
            });
          }
          history.push({ role: 'user', parts: responseParts });

          if (steps >= MAX_STEPS) {
            assistantText = '_(agent stopped after max tool steps)_';
            send({ type: 'text', text: assistantText });
          }
        }

        // Persist final assistant message (with tool-call log).
        await addAgentChatMessage({
          chatId,
          role: 'assistant',
          content: assistantText,
          toolCalls: toolCallLog.length ? toolCallLog : null,
          createdBy: null,
          createdByName: null,
          createdByImage: null,
        });
        await touchAgentChat(chatId);

        send({ type: 'done' });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Persist whatever we got so the user isn't left with an invisible failure.
        try {
          await addAgentChatMessage({
            chatId,
            role: 'assistant',
            content: assistantText || `_(error: ${message})_`,
            toolCalls: toolCallLog.length ? toolCallLog : null,
            createdBy: null,
            createdByName: null,
            createdByImage: null,
          });
          await touchAgentChat(chatId);
        } catch {
          /* swallow — primary error already reported */
        }
        send({ type: 'error', message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function summarizeForStream(result: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...result };
  if (Array.isArray(clone.rows) && clone.rows.length > 5) {
    clone.rows = [...clone.rows.slice(0, 5), { __truncated__: `${clone.rows.length - 5} more rows hidden` }];
  }
  if (Array.isArray(clone.tables) && clone.tables.length > 40) {
    clone.tables = [...clone.tables.slice(0, 40), `…+${clone.tables.length - 40} more`];
  }
  return clone;
}
