'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Sparkles,
  User2,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  AgentSteps,
  AgentTool,
  BarsLoader,
  GeminiLogo,
  type AgentToolPart,
  type ToolState,
} from '@/components/agent';

type ChatRow = {
  id: string;
  title: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  participants: Participant[] | null;
  messageCount: number;
};

type StoredToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

type StoredMessage = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: StoredToolCall[] | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdByImage?: string | null;
  createdAt: string;
};

type Participant = { email: string; name: string | null; image: string | null };

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallInFlight[];
  createdBy: string | null;
  createdByName: string | null;
  createdByImage: string | null;
};

type ToolCallInFlight = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  state: ToolState;
  output?: Record<string, unknown>;
};

type StreamEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: Record<string, unknown> }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

const SUGGESTIONS = [
  'What are our best-performing captions and what do they have in common?',
  "Analyze posting time vs. views — what's our optimal publish window per platform?",
  'Rank our pipeline_batches by average views per video and explain which one is winning.',
  'Which custom variable values correlate with higher engagement?',
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function storedToChatMessage(m: StoredMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdBy: m.createdBy,
    createdByName: m.createdByName ?? null,
    createdByImage: m.createdByImage ?? null,
    toolCalls: (m.toolCalls || []).map((tc) => ({
      id: newId(),
      name: tc.name,
      args: tc.args || {},
      state:
        tc.result && typeof (tc.result as Record<string, unknown>).error === 'string'
          ? 'error'
          : 'done',
      output: tc.result,
    })),
  };
}

function firstName(name: string | null | undefined, email: string | null | undefined): string {
  const raw = (name || '').trim();
  if (raw) {
    const first = raw.split(/\s+/)[0];
    return first.length > 10 ? first.slice(0, 9) + '…' : first;
  }
  if (!email) return 'User';
  const handle = email.split('@')[0] || 'User';
  const cap = handle.charAt(0).toUpperCase() + handle.slice(1);
  return cap.length > 10 ? cap.slice(0, 9) + '…' : cap;
}

// ── Avatar helpers ──

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];

function colorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsFor(email: string, name?: string | null): string {
  const raw = (name || '').trim();
  if (raw) return raw.charAt(0).toUpperCase();
  const handle = email.split('@')[0] || email;
  return (handle.charAt(0) || 'U').toUpperCase();
}

function Avatar({
  email,
  name,
  image,
  size = 20,
  title,
}: {
  email: string;
  name?: string | null;
  image?: string | null;
  size?: number;
  title?: string;
}) {
  const [broken, setBroken] = useState(false);
  const tooltip = title || name || email;
  const common = {
    title: tooltip,
    style: { width: size, height: size },
    className:
      'inline-flex items-center justify-center rounded-full overflow-hidden ring-2 ring-[var(--bg-primary)]',
  };

  if (image && !broken) {
    return (
      <span {...common}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={tooltip}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-[var(--bg-primary)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.floor(size * 0.5)),
        background: colorForEmail(email),
      }}
    >
      {initialsFor(email, name)}
    </span>
  );
}

function ParticipantStack({ participants }: { participants: Participant[] }) {
  const shown = participants.slice(0, 3);
  const extra = participants.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.email} email={p.email} name={p.name} image={p.image} size={18} />
      ))}
      {extra > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--bg-tertiary)] px-1 text-[9px] font-semibold text-[var(--text-muted)] ring-2 ring-[var(--bg-primary)]">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── Page ──

const CHATS_PAGE_SIZE = 20;

export default function AgentPage() {
  const { data: session } = useSession();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendLockRef = useRef(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('agentSidebarOpen') : null;
    if (stored !== null) setSidebarOpen(stored === '1');
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('agentSidebarOpen', sidebarOpen ? '1' : '0');
    }
  }, [sidebarOpen]);

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/chats?limit=${CHATS_PAGE_SIZE}&offset=0`);
      if (!res.ok) return;
      const json = (await res.json()) as { chats: ChatRow[]; total: number };
      setChats(json.chats || []);
      setChatsTotal(json.total || 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadMoreChats = useCallback(async () => {
    if (loadingMoreChats) return;
    setLoadingMoreChats(true);
    try {
      const res = await fetch(`/api/agent/chats?limit=${CHATS_PAGE_SIZE}&offset=${chats.length}`);
      if (!res.ok) return;
      const json = (await res.json()) as { chats: ChatRow[]; total: number };
      setChats((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const merged = [...prev];
        for (const c of json.chats || []) if (!existing.has(c.id)) merged.push(c);
        return merged;
      });
      setChatsTotal(json.total || 0);
    } catch {
      /* ignore */
    } finally {
      setLoadingMoreChats(false);
    }
  }, [chats.length, loadingMoreChats]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  const openChat = useCallback(async (id: string) => {
    setLoadingChat(true);
    setError(null);
    setActiveChatId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/agent/chats/${id}`);
      if (!res.ok) throw new Error(`Failed to load chat (${res.status})`);
      const json = (await res.json()) as { messages: StoredMessage[] };
      setMessages((json.messages || []).map(storedToChatMessage));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoadingChat(false);
    }
  }, []);

  const startNewChat = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/agent/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to create chat (${res.status})`);
      const json = (await res.json()) as { chat: ChatRow };
      setChats((prev) => [{ ...json.chat, participants: [], messageCount: 0 }, ...prev.filter((c) => c.id !== json.chat.id)]);
      setActiveChatId(json.chat.id);
      setMessages([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

  const applyEvent = useCallback((evt: StreamEvent, assistantId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantId) return m;
        if (evt.type === 'tool_call') {
          return {
            ...m,
            toolCalls: [
              ...m.toolCalls,
              { id: newId(), name: evt.name, args: evt.args, state: 'running' },
            ],
          };
        }
        if (evt.type === 'tool_result') {
          const toolCalls = [...m.toolCalls];
          for (let i = toolCalls.length - 1; i >= 0; i--) {
            if (toolCalls[i].name === evt.name && toolCalls[i].state === 'running') {
              const isError = typeof evt.result?.error === 'string';
              toolCalls[i] = {
                ...toolCalls[i],
                state: isError ? 'error' : 'done',
                output: evt.result,
              };
              break;
            }
          }
          return { ...m, toolCalls };
        }
        if (evt.type === 'text') {
          return { ...m, content: m.content + evt.text };
        }
        return m;
      }),
    );
    if (evt.type === 'error') setError(evt.message);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Synchronous re-entry guard — `busy` is React state and lags behind
      // rapid clicks. A ref prevents duplicate fires before the first render
      // flips `busy` to true.
      if (sendLockRef.current) return;
      sendLockRef.current = true;
      setBusy(true);
      setError(null);

      try {
        let chatId = activeChatId;
        if (!chatId) {
          const res = await fetch('/api/agent/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Failed to create chat (${res.status}): ${body || res.statusText}`);
          }
          const json = (await res.json()) as { chat: ChatRow };
          chatId = json.chat.id;
          setActiveChatId(chatId);
          setChats((prev) => [{ ...json.chat, participants: [], messageCount: 0 }, ...prev.filter((c) => c.id !== json.chat.id)]);
        }

        const userMsg: ChatMessage = {
          id: newId(),
          role: 'user',
          content: trimmed,
          toolCalls: [],
          createdBy: session?.user?.email || null,
          createdByName: session?.user?.name || null,
          createdByImage: session?.user?.image || null,
        };
        const assistantId = newId();
        const assistantMsg: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          createdBy: null,
          createdByName: null,
          createdByImage: null,
        };

        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setInput('');

        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, userMessage: trimmed }),
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '');
          throw new Error(`Agent error (${res.status}): ${body || res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt: StreamEvent;
            try {
              evt = JSON.parse(payload) as StreamEvent;
            } catch {
              continue;
            }
            applyEvent(evt, assistantId);
          }
        }

        void loadChats();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        sendLockRef.current = false;
        setBusy(false);
      }
    },
    [activeChatId, applyEvent, loadChats, session?.user?.email, session?.user?.image, session?.user?.name],
  );

  const empty = messages.length === 0 && !loadingChat;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-0px)] flex-row">
      {/* Collapsible chat list */}
      <aside
        className={
          'relative flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]/60 transition-[width] duration-200 ease-out ' +
          (sidebarOpen ? 'w-64' : 'w-10')
        }
      >
        {sidebarOpen ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-3">
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Collapse"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Chats
              </button>
              <Button size="sm" variant="ghost" onClick={() => void startNewChat()} className="h-7 gap-1.5 px-2 text-xs">
                <MessageSquarePlus className="h-3.5 w-3.5" />
                New
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {chats.length === 0 && (
                <p className="px-2 py-3 text-xs text-[var(--text-muted)]">
                  No chats yet. Start one to investigate your data.
                </p>
              )}
              {chats.map((c) => {
                const active = c.id === activeChatId;
                const participants = c.participants || [];
                return (
                  <button
                    key={c.id}
                    onClick={() => void openChat(c.id)}
                    className={
                      'mb-1 block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ' +
                      (active
                        ? 'border-[var(--primary)]/40 bg-[var(--accent)]'
                        : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-tertiary)]')
                    }
                  >
                    <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {c.title || 'Untitled'}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {participants.length > 0 ? (
                          <>
                            <ParticipantStack participants={participants} />
                            <span className="ml-1 truncate text-[10px] text-[var(--text-muted)]">
                              {participants.map((p) => firstName(p.name, p.email)).join(', ')}
                            </span>
                          </>
                        ) : c.createdBy ? (
                          <Avatar email={c.createdBy} size={18} />
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                        {formatRelative(c.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {chats.length < chatsTotal && (
                <button
                  onClick={() => void loadMoreChats()}
                  disabled={loadingMoreChats}
                  className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-center text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingMoreChats ? (
                    <span className="inline-flex items-center gap-2">
                      <BarsLoader size={10} /> Loading…
                    </span>
                  ) : (
                    `Load more (${chatsTotal - chats.length})`
                  )}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              title="Open chats"
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => void startNewChat()}
              title="New chat"
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Main chat area — no header, no footer text */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:px-8">
            {loadingChat && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-muted)]">
                <BarsLoader size={14} /> Loading chat…
              </div>
            )}
            {empty && <EmptyState disabled={busy} onPick={(s) => void send(s)} />}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} isLastAssistantBusy={busy && m.role === 'assistant' && m.id === messages[messages.length - 1]?.id} />
            ))}
            {busy && messages[messages.length - 1]?.role !== 'assistant' && <ThinkingIndicator />}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 bg-transparent">
          <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-8">
            <div className="flex items-end gap-2 rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 shadow-sm focus-within:border-[var(--primary)]/50">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your data…"
                rows={1}
                className="flex-1 resize-none border-0 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-muted)]"
                disabled={busy}
              />
              <Button
                size="icon"
                onClick={() => void send(input)}
                disabled={!input.trim() || busy}
                className="size-8 shrink-0 rounded-full"
              >
                {busy ? <BarsLoader size={14} /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (q: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
        <Sparkles className="h-7 w-7" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">What do you want to learn about your data?</h1>
        <p className="text-sm text-[var(--text-muted)]">
          I can read every table in the production DB. I&apos;ll run SELECTs, aggregate, and report back.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-left text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <BarsLoader size={12} />
      Thinking…
    </div>
  );
}

function MessageBubble({ message, isLastAssistantBusy }: { message: ChatMessage; isLastAssistantBusy: boolean }) {
  const isUser = message.role === 'user';

  if (isUser) {
    const label = firstName(message.createdByName, message.createdBy);
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <div className="flex items-start gap-2">
            <div className="rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-sm text-white whitespace-pre-wrap">
              {message.content}
            </div>
            {message.createdBy ? (
              <div className="mt-1 shrink-0">
                <Avatar
                  email={message.createdBy}
                  name={message.createdByName}
                  image={message.createdByImage}
                  size={24}
                />
              </div>
            ) : (
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                <User2 className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
          {message.createdBy && (
            <span
              className="truncate text-[10px] text-[var(--text-muted)]"
              title={message.createdByName || message.createdBy}
              style={{ maxWidth: 140 }}
            >
              {label}
            </span>
          )}
        </div>
      </div>
    );
  }

  const runningCount = message.toolCalls.filter((tc) => tc.state === 'running').length;
  const totalCount = message.toolCalls.length;
  const stepsTitle =
    runningCount > 0
      ? `Investigating… (${totalCount - runningCount}/${totalCount} done)`
      : totalCount > 0
      ? `Agent ran ${totalCount} tool call${totalCount === 1 ? '' : 's'}`
      : '';

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        <GeminiLogo size={28} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {totalCount > 0 && (
          <AgentSteps
            title={stepsTitle}
            count={totalCount}
            running={runningCount > 0}
            defaultOpen={runningCount > 0 || !message.content}
          >
            {message.toolCalls.map((tc) => {
              const part: AgentToolPart = {
                name: tc.name,
                state: tc.state,
                input: tc.args,
                output: tc.output,
              };
              return <AgentTool key={tc.id} part={part} />;
            })}
          </AgentSteps>
        )}
        {isLastAssistantBusy && !message.content && <ThinkingIndicator />}
        {message.content && <MarkdownLite text={message.content} />}
      </div>
    </div>
  );
}

function MarkdownLite({ text }: { text: string }) {
  const blocks = useMemo(() => splitCodeBlocks(text), [text]);
  return (
    <div
      className="prose prose-sm min-w-0 max-w-none text-[var(--text-primary)]"
      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
    >
      {blocks.map((b, i) =>
        b.type === 'code' ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 font-mono text-[12px]"
          >
            <code>{b.content}</code>
          </pre>
        ) : (
          <InlineMarkdown key={i} text={b.content} />
        ),
      )}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] | null = null;

  const flushList = (key: string) => {
    if (list && list.length) {
      out.push(
        <ul key={key} className="my-1 list-disc space-y-0.5 pl-5 text-sm">
          {list.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
    }
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (bullet) {
      list = list ?? [];
      list.push(bullet[1]);
      return;
    }
    flushList(`ul-${idx}`);
    if (heading) {
      const level = heading[1].length;
      const content = heading[2];
      const cls =
        level === 1
          ? 'text-lg font-semibold mt-3 mb-1'
          : level === 2
          ? 'text-base font-semibold mt-3 mb-1'
          : 'text-sm font-semibold mt-2 mb-1';
      out.push(
        <p key={`h-${idx}`} className={cls}>
          {renderInline(content)}
        </p>,
      );
      return;
    }
    if (line === '') {
      out.push(<div key={`br-${idx}`} className="h-2" />);
      return;
    }
    out.push(
      <p key={`p-${idx}`} className="my-1 text-sm leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  });
  flushList('ul-final');
  return <>{out}</>;
}

function renderInline(s: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // [label](url), `code`, **bold**, *italic*, bare https?://urls
  const re =
    /(\[(?:[^\]]+)\]\((?:https?:\/\/[^)\s]+)\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('[')) {
      const linkMatch = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={key++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] underline decoration-[var(--primary)]/40 underline-offset-2 hover:decoration-[var(--primary)]"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(tok);
      }
    } else if (tok.startsWith('`')) {
      parts.push(
        <code key={key++} className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[12px]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith('*')) {
      parts.push(
        <em key={key++} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    } else {
      // bare URL
      parts.push(
        <a
          key={key++}
          href={tok}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--primary)] underline decoration-[var(--primary)]/40 underline-offset-2 hover:decoration-[var(--primary)] break-all"
        >
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return <>{parts}</>;
}

function splitCodeBlocks(text: string): Array<{ type: 'text' | 'code'; content: string }> {
  const blocks: Array<{ type: 'text' | 'code'; content: string }> = [];
  const re = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) blocks.push({ type: 'text', content: text.slice(last, m.index) });
    blocks.push({ type: 'code', content: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) blocks.push({ type: 'text', content: text.slice(last) });
  if (blocks.length === 0) blocks.push({ type: 'text', content: text });
  return blocks;
}
