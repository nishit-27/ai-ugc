import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { initDatabase } from '@/lib/db';
import { getTwitterPipeline, updateTwitterPipeline } from '@/lib/db-twitter-pipelines';
import { lateApiRequest } from '@/lib/lateApi';
import { config } from '@/lib/config';
import { after } from 'next/server';
import type {
  TwitterPipelineStep,
  TwitterTweetConfig,
  TwitterThreadConfig,
  TwitterReplyConfig,
  TwitterQuoteConfig,
  TwitterEngageConfig,
} from '@/types';

export const dynamic = 'force-dynamic';

async function executeStep(
  step: TwitterPipelineStep,
  accountIds: string[],
  apiKey: string
) {
  const results: { stepId: string; accountId: string; success: boolean; error?: string; postUrl?: string }[] = [];

  for (const accountId of accountIds) {
    try {
      switch (step.type) {
        case 'tweet': {
          const cfg = step.config as TwitterTweetConfig;
          const postBody: Record<string, unknown> = {
            content: cfg.content,
            platforms: [
              {
                platform: 'twitter',
                accountId,
                platformData: {
                  replySettings: cfg.replySettings,
                  ...(cfg.poll ? { poll: cfg.poll } : {}),
                },
              },
            ],
            publishNow: true,
          };
          if (cfg.mediaUrls?.length) {
            postBody.mediaItems = cfg.mediaUrls.map((url) => ({
              type: 'image',
              url,
            }));
          }
          const res = await lateApiRequest<{ _id: string }>('/posts', {
            method: 'POST',
            body: JSON.stringify(postBody),
            apiKey,
          });
          results.push({ stepId: step.id, accountId, success: true, postUrl: res._id });
          break;
        }
        case 'thread': {
          const cfg = step.config as TwitterThreadConfig;
          const threadItems = cfg.items.map((item) => ({
            content: item.content,
            ...(item.mediaUrls?.length
              ? { mediaItems: item.mediaUrls.map((url) => ({ type: 'image', url })) }
              : {}),
          }));
          const postBody = {
            content: cfg.items[0]?.content || '',
            platforms: [
              {
                platform: 'twitter',
                accountId,
                platformData: { threadItems },
              },
            ],
            publishNow: true,
          };
          const res = await lateApiRequest<{ _id: string }>('/posts', {
            method: 'POST',
            body: JSON.stringify(postBody),
            apiKey,
          });
          results.push({ stepId: step.id, accountId, success: true, postUrl: res._id });
          break;
        }
        case 'reply': {
          const cfg = step.config as TwitterReplyConfig;
          const postBody: Record<string, unknown> = {
            content: cfg.content,
            platforms: [
              {
                platform: 'twitter',
                accountId,
                platformData: { replyToTweetId: cfg.tweetId },
              },
            ],
            publishNow: true,
          };
          if (cfg.mediaUrls?.length) {
            postBody.mediaItems = cfg.mediaUrls.map((url) => ({ type: 'image', url }));
          }
          const res = await lateApiRequest<{ _id: string }>('/posts', {
            method: 'POST',
            body: JSON.stringify(postBody),
            apiKey,
          });
          results.push({ stepId: step.id, accountId, success: true, postUrl: res._id });
          break;
        }
        case 'quote': {
          const cfg = step.config as TwitterQuoteConfig;
          const tweetUrl = cfg.tweetUrl;
          const postBody: Record<string, unknown> = {
            content: `${cfg.content}\n\n${tweetUrl}`,
            platforms: [{ platform: 'twitter', accountId }],
            publishNow: true,
          };
          if (cfg.mediaUrls?.length) {
            postBody.mediaItems = cfg.mediaUrls.map((url) => ({ type: 'image', url }));
          }
          const res = await lateApiRequest<{ _id: string }>('/posts', {
            method: 'POST',
            body: JSON.stringify(postBody),
            apiKey,
          });
          results.push({ stepId: step.id, accountId, success: true, postUrl: res._id });
          break;
        }
        case 'engage': {
          const cfg = step.config as TwitterEngageConfig;
          if (cfg.actions.retweet && cfg.tweetId) {
            await lateApiRequest('/twitter/retweet', {
              method: 'POST',
              body: JSON.stringify({ accountId, tweetId: cfg.tweetId }),
              apiKey,
            });
          }
          if (cfg.actions.bookmark && cfg.tweetId) {
            await lateApiRequest('/twitter/bookmark', {
              method: 'POST',
              body: JSON.stringify({ accountId, tweetId: cfg.tweetId }),
              apiKey,
            });
          }
          results.push({ stepId: step.id, accountId, success: true });
          break;
        }
        case 'media':
          results.push({ stepId: step.id, accountId, success: true });
          break;
      }
    } catch (err) {
      results.push({
        stepId: step.id,
        accountId,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
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

  const steps = pipeline.steps as TwitterPipelineStep[];
  const accountIds = pipeline.accountIds as string[];
  const apiKey = config.ZERNIO_API_KEYS[0];

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
  }

  await updateTwitterPipeline(pipelineId, { status: 'running' });

  after(async () => {
    try {
      const allResults: unknown[] = [];
      for (const step of steps) {
        if (!step.enabled) continue;
        const stepResults = await executeStep(step, accountIds, apiKey);
        allResults.push(...stepResults);
      }
      await updateTwitterPipeline(pipelineId, {
        status: 'completed',
        completedAt: new Date(),
      });
    } catch (err) {
      await updateTwitterPipeline(pipelineId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Pipeline execution failed',
      });
    }
  });

  return NextResponse.json({ success: true, status: 'running' });
}
