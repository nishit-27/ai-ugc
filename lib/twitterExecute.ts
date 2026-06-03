import type {
  TwitterPipelineStep,
  TwitterTweetConfig,
  TwitterThreadConfig,
  TwitterReplyConfig,
  TwitterQuoteConfig,
  TwitterMediaConfig,
} from '@/types';

// Pure (no network / no DB) helpers for the Twitter execute route. Kept here so
// the risky logic — media merging, publish-mode mapping, target resolution and
// Late response parsing — is unit-testable in isolation.

export type PublishMode = 'now' | 'schedule' | 'queue' | 'draft';

export type Target = { accountId: string; apiKeyIndex: number; modelName?: string };

export type LatePostResponse = {
  post?: { _id?: string; platforms?: { platformPostUrl?: string }[] };
  _id?: string;
  platforms?: { platformPostUrl?: string }[];
};

export type AccountModelMap = Record<string, { modelName?: string } | undefined>;

export type MappingRow = {
  lateAccountId: string;
  platform: string | null;
  apiKeyIndex: number | null;
};

// Resolve selected-model account mappings (+ legacy raw account IDs) into the
// unique list of X/Twitter publish targets, each carrying its API key index.
export function resolveTargetsFromMappings(
  mappings: MappingRow[],
  accountToModel: AccountModelMap,
  legacyAccountIds: string[] = []
): Target[] {
  const seen = new Set<string>();
  const targets: Target[] = [];

  for (const m of mappings) {
    const platform = String(m.platform || '').toLowerCase();
    if (platform !== 'twitter' && platform !== 'x') continue;
    if (!m.lateAccountId || seen.has(m.lateAccountId)) continue;
    seen.add(m.lateAccountId);
    targets.push({
      accountId: m.lateAccountId,
      apiKeyIndex: m.apiKeyIndex ?? 0,
      modelName: accountToModel[m.lateAccountId]?.modelName,
    });
  }

  for (const accountId of legacyAccountIds || []) {
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    targets.push({
      accountId,
      apiKeyIndex: 0,
      modelName: accountToModel[accountId]?.modelName,
    });
  }

  return targets;
}

export function applyPublishMode(
  body: Record<string, unknown>,
  mode: PublishMode,
  scheduledForIso: string | null,
  timezone: string | null,
  defaultTimezone: string
): Record<string, unknown> {
  switch (mode) {
    case 'schedule':
      if (scheduledForIso) {
        body.scheduledFor = scheduledForIso;
        body.timezone = timezone || defaultTimezone;
        body.publishNow = false;
      } else {
        body.publishNow = true;
      }
      break;
    case 'queue':
      body.publishNow = false;
      body.addToQueue = true;
      break;
    case 'draft':
      body.isDraft = true;
      body.publishNow = false;
      break;
    case 'now':
    default:
      body.publishNow = true;
      break;
  }
  return body;
}

// Late returns { post: { _id, platforms } }; some endpoints return the post flat.
export function readPostResult(res: LatePostResponse): { latePostId?: string; postUrl?: string } {
  const post = res?.post || res;
  const latePostId = post?._id;
  const postUrl = post?.platforms?.find((p) => p.platformPostUrl)?.platformPostUrl;
  return { latePostId, postUrl };
}

export function addMediaUrl(step: TwitterPipelineStep, url: string): void {
  if (step.type === 'thread') {
    const cfg = step.config as TwitterThreadConfig;
    const first = cfg.items[0];
    if (first) first.mediaUrls = [...(first.mediaUrls || []), url];
  } else if (step.type === 'tweet' || step.type === 'reply' || step.type === 'quote') {
    const cfg = step.config as TwitterTweetConfig | TwitterReplyConfig | TwitterQuoteConfig;
    cfg.mediaUrls = [...(cfg.mediaUrls || []), url];
  }
}

// Clone enabled steps and fold standalone `media` steps into their target
// content step's media list (by attachToStepId, else the nearest preceding
// content step). Returns the postable steps with media merged in. The input
// array is never mutated.
export function preprocessSteps(steps: TwitterPipelineStep[]): TwitterPipelineStep[] {
  const enabled = steps.filter((s) => s.enabled);
  const clones = enabled.map((s) => structuredClone(s));
  const contentSteps = clones.filter((s) => s.type !== 'media');

  for (let i = 0; i < clones.length; i++) {
    const step = clones[i];
    if (step.type !== 'media') continue;
    const cfg = step.config as TwitterMediaConfig;
    if (!cfg.mediaUrl) continue;

    let targetId = cfg.attachToStepId;
    if (!targetId) {
      for (let j = i - 1; j >= 0; j--) {
        if (clones[j].type !== 'media') {
          targetId = clones[j].id;
          break;
        }
      }
    }
    const target = contentSteps.find((s) => s.id === targetId);
    if (target) addMediaUrl(target, cfg.mediaUrl);
  }

  return contentSteps;
}
