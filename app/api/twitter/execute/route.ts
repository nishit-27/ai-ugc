import { NextResponse, after } from 'next/server';
import { auth } from '@/lib/auth';
import {
  initDatabase,
  getModelAccountMappingsForModels,
  getAccountToModelMap,
} from '@/lib/db';
import {
  getTwitterPipeline,
  updateTwitterPipeline,
  type TwitterPipelineResult,
} from '@/lib/db-twitter-pipelines';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { getApiKeyByIndex } from '@/lib/lateAccountPool';
import { uploadMediaUrlsToLate, type LateMediaItem } from '@/lib/lateMedia';
import { parseTweetIdFromUrl } from '@/lib/twitter-api';
import { config } from '@/lib/config';
import {
  applyPublishMode,
  preprocessSteps,
  readPostResult,
  resolveTargetsFromMappings,
  type PublishMode,
  type Target,
  type LatePostResponse,
} from '@/lib/twitterExecute';
import type {
  TwitterPipelineStep,
  TwitterTweetConfig,
  TwitterThreadConfig,
  TwitterReplyConfig,
  TwitterQuoteConfig,
  TwitterEngageConfig,
} from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ── Resolve selected models (+ legacy account IDs) → Late X/Twitter accounts ──
async function resolveTargets(
  modelIds: string[],
  legacyAccountIds: string[]
): Promise<Target[]> {
  const accountToModel = (await getAccountToModelMap()) as Record<
    string,
    { modelId: string; modelName: string }
  >;
  const mappings = modelIds.length > 0 ? await getModelAccountMappingsForModels(modelIds) : [];
  return resolveTargetsFromMappings(mappings, accountToModel, legacyAccountIds);
}

async function executeStep(
  step: TwitterPipelineStep,
  target: Target,
  apiKey: string,
  mediaCache: Map<string, LateMediaItem>,
  mode: PublishMode,
  scheduledForIso: string | null,
  timezone: string | null
): Promise<TwitterPipelineResult> {
  const base: TwitterPipelineResult = {
    stepId: step.id,
    stepType: step.type,
    accountId: target.accountId,
    modelName: target.modelName,
    success: false,
  };
  const accountId = target.accountId;

  try {
    switch (step.type) {
      case 'tweet': {
        const cfg = step.config as TwitterTweetConfig;
        if (!cfg.content?.trim() && !cfg.mediaUrls?.length) {
          throw new Error('Tweet has no content or media');
        }
        const mediaItems = await uploadMediaUrlsToLate(cfg.mediaUrls || [], apiKey, mediaCache);
        const platformSpecificData: Record<string, unknown> = {};
        if (cfg.replySettings) platformSpecificData.replySettings = cfg.replySettings;
        if (cfg.poll?.options?.length) platformSpecificData.poll = cfg.poll;
        const body: Record<string, unknown> = {
          content: cfg.content || '',
          platforms: [{ platform: 'twitter', accountId, platformSpecificData }],
          ...(mediaItems.length ? { mediaItems } : {}),
        };
        applyPublishMode(body, mode, scheduledForIso, timezone, config.defaultTimezone);
        const res = await postToLate(body, apiKey);
        return { ...base, success: true, ...readPostResult(res) };
      }

      case 'thread': {
        const cfg = step.config as TwitterThreadConfig;
        const items = cfg.items.filter((it) => it.content?.trim() || it.mediaUrls?.length);
        if (items.length === 0) throw new Error('Thread has no content');
        const firstMedia = await uploadMediaUrlsToLate(items[0].mediaUrls || [], apiKey, mediaCache);
        // content = first tweet; threadItems = subsequent tweets in the thread.
        const threadItems: Record<string, unknown>[] = [];
        for (const item of items.slice(1)) {
          const m = await uploadMediaUrlsToLate(item.mediaUrls || [], apiKey, mediaCache);
          threadItems.push({ content: item.content || '', ...(m.length ? { mediaItems: m } : {}) });
        }
        const platformSpecificData: Record<string, unknown> = {};
        if (threadItems.length) platformSpecificData.threadItems = threadItems;
        const body: Record<string, unknown> = {
          content: items[0].content || '',
          platforms: [{ platform: 'twitter', accountId, platformSpecificData }],
          ...(firstMedia.length ? { mediaItems: firstMedia } : {}),
        };
        applyPublishMode(body, mode, scheduledForIso, timezone, config.defaultTimezone);
        const res = await postToLate(body, apiKey);
        return { ...base, success: true, ...readPostResult(res) };
      }

      case 'reply': {
        const cfg = step.config as TwitterReplyConfig;
        const tweetId = cfg.tweetId || parseTweetIdFromUrl(cfg.tweetUrl || '');
        if (!tweetId) throw new Error('Reply step is missing a valid tweet URL');
        if (!cfg.content?.trim() && !cfg.mediaUrls?.length) throw new Error('Reply has no content');
        const mediaItems = await uploadMediaUrlsToLate(cfg.mediaUrls || [], apiKey, mediaCache);
        const body: Record<string, unknown> = {
          content: cfg.content || '',
          platforms: [{ platform: 'twitter', accountId, platformSpecificData: { replyToTweetId: tweetId } }],
          ...(mediaItems.length ? { mediaItems } : {}),
        };
        applyPublishMode(body, mode, scheduledForIso, timezone, config.defaultTimezone);
        const res = await postToLate(body, apiKey);
        return { ...base, success: true, ...readPostResult(res) };
      }

      case 'quote': {
        const cfg = step.config as TwitterQuoteConfig;
        const tweetId = cfg.tweetId || parseTweetIdFromUrl(cfg.tweetUrl || '');
        const mediaItems = await uploadMediaUrlsToLate(cfg.mediaUrls || [], apiKey, mediaCache);
        const platformSpecificData: Record<string, unknown> = {};
        let content = cfg.content || '';
        if (tweetId) {
          platformSpecificData.quoteTweetId = tweetId;
        } else if (cfg.tweetUrl) {
          // Fallback: embed the URL so X renders the quoted card.
          content = `${content}\n\n${cfg.tweetUrl}`.trim();
        }
        const body: Record<string, unknown> = {
          content,
          platforms: [{ platform: 'twitter', accountId, platformSpecificData }],
          ...(mediaItems.length ? { mediaItems } : {}),
        };
        applyPublishMode(body, mode, scheduledForIso, timezone, config.defaultTimezone);
        const res = await postToLate(body, apiKey);
        return { ...base, success: true, ...readPostResult(res) };
      }

      case 'engage': {
        const cfg = step.config as TwitterEngageConfig;
        const tweetId = cfg.tweetId || parseTweetIdFromUrl(cfg.tweetUrl || '');
        if (!tweetId) throw new Error('Engage step is missing a valid tweet URL');
        const actions: { name: string; endpoint: string }[] = [];
        if (cfg.actions.retweet) actions.push({ name: 'retweet', endpoint: '/twitter/retweet' });
        if (cfg.actions.like) actions.push({ name: 'like', endpoint: '/twitter/like' });
        if (cfg.actions.bookmark) actions.push({ name: 'bookmark', endpoint: '/twitter/bookmark' });
        if (actions.length === 0) throw new Error('No engagement actions selected');

        const failures: string[] = [];
        for (const action of actions) {
          try {
            await lateApiRequest(action.endpoint, {
              method: 'POST',
              body: JSON.stringify({ accountId, tweetId }),
              apiKey,
            });
          } catch (err) {
            failures.push(`${action.name}: ${err instanceof Error ? err.message : 'failed'}`);
          }
        }
        if (failures.length === actions.length) throw new Error(failures.join('; '));
        return { ...base, success: true, ...(failures.length ? { error: `Partial: ${failures.join('; ')}` } : {}) };
      }

      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  } catch (err) {
    let message = err instanceof Error ? err.message : 'Unknown error';
    if (err instanceof LateApiError && err.body && typeof err.body === 'object') {
      const b = err.body as Record<string, unknown>;
      message = (b.error as string) || (b.message as string) || message;
    }
    return { ...base, success: false, error: message };
  }
}

async function postToLate(body: Record<string, unknown>, apiKey: string): Promise<LatePostResponse> {
  try {
    return await lateApiRequest<LatePostResponse>('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
      timeout: 60000,
      apiKey,
    });
  } catch (err) {
    // Late occasionally 422s if media isn't processed yet — retry once.
    const mediaNotReady =
      err instanceof LateApiError &&
      (err.status === 422 || err.status === 400) &&
      JSON.stringify(err.body || '').toLowerCase().includes('media');
    if (!mediaNotReady) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return await lateApiRequest<LatePostResponse>('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
      timeout: 60000,
      apiKey,
    });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await initDatabase();

  const { pipelineId } = await req.json();
  if (!pipelineId) {
    return NextResponse.json({ error: 'pipelineId is required' }, { status: 400 });
  }

  const pipeline = await getTwitterPipeline(pipelineId);
  if (!pipeline) {
    return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
  }

  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'No social API key configured (ZERNIO_API_KEYS)' }, { status: 500 });
  }

  const steps = preprocessSteps(pipeline.steps as TwitterPipelineStep[]);
  if (steps.length === 0) {
    return NextResponse.json({ error: 'Pipeline has no enabled postable steps' }, { status: 400 });
  }

  const mode = ((pipeline.publishMode as PublishMode) || 'now');
  // Late/Zernio expects the wall-clock `datetime-local` string ("YYYY-MM-DDTHH:mm")
  // alongside `timezone`, matching app/api/posts/upload + master post routes —
  // not a UTC ISO string. (Vercel runs UTC so these components round-trip.)
  const scheduledForIso = pipeline.scheduledFor
    ? new Date(pipeline.scheduledFor).toISOString().slice(0, 16)
    : null;
  if (mode === 'schedule' && !scheduledForIso) {
    return NextResponse.json({ error: 'Schedule mode requires a scheduled time' }, { status: 400 });
  }

  const targets = await resolveTargets(
    (pipeline.modelIds as string[]) || [],
    (pipeline.accountIds as string[]) || []
  );
  if (targets.length === 0) {
    await updateTwitterPipeline(pipelineId, {
      status: 'failed',
      error: 'No X/Twitter accounts are linked to the selected models. Connect an X account to a model in /models first.',
      completedAt: new Date(),
    });
    return NextResponse.json(
      { error: 'No X/Twitter accounts linked to the selected models' },
      { status: 400 }
    );
  }

  await updateTwitterPipeline(pipelineId, { status: 'running', results: [], error: undefined });

  after(async () => {
    const results: TwitterPipelineResult[] = [];
    const mediaCache = new Map<string, LateMediaItem>();
    try {
      for (const step of steps) {
        for (const target of targets) {
          const apiKey = getApiKeyByIndex(target.apiKeyIndex);
          const result = await executeStep(
            step,
            target,
            apiKey,
            mediaCache,
            mode,
            scheduledForIso,
            pipeline.timezone || null
          );
          results.push(result);
        }
      }
      const anyFail = results.some((r) => !r.success);
      const allFail = results.every((r) => !r.success);
      await updateTwitterPipeline(pipelineId, {
        status: allFail ? 'failed' : anyFail ? 'partial' : 'completed',
        results,
        completedAt: new Date(),
        ...(allFail ? { error: results.find((r) => r.error)?.error || 'All steps failed' } : {}),
      });
    } catch (err) {
      await updateTwitterPipeline(pipelineId, {
        status: 'failed',
        results,
        error: err instanceof Error ? err.message : 'Pipeline execution failed',
        completedAt: new Date(),
      });
    }
  });

  return NextResponse.json({ success: true, status: 'running', accounts: targets.length });
}
