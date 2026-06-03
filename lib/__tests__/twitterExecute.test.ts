import { describe, expect, it } from 'vitest';
import {
  applyPublishMode,
  preprocessSteps,
  readPostResult,
  resolveTargetsFromMappings,
  type MappingRow,
} from '@/lib/twitterExecute';
import type {
  TwitterPipelineStep,
  TwitterTweetConfig,
  TwitterThreadConfig,
  TwitterMediaConfig,
} from '@/types';

const TZ = 'Asia/Kolkata';

describe('applyPublishMode', () => {
  it('publishes now', () => {
    expect(applyPublishMode({}, 'now', null, null, TZ)).toEqual({ publishNow: true });
  });

  it('schedules with the wall-time string + timezone', () => {
    expect(applyPublishMode({}, 'schedule', '2026-06-10T14:00', 'UTC', TZ)).toEqual({
      scheduledFor: '2026-06-10T14:00',
      timezone: 'UTC',
      publishNow: false,
    });
  });

  it('falls back to the default timezone when none is given', () => {
    const body = applyPublishMode({}, 'schedule', '2026-06-10T14:00', null, TZ);
    expect(body.timezone).toBe(TZ);
  });

  it('falls back to publish-now when schedule has no time', () => {
    expect(applyPublishMode({}, 'schedule', null, 'UTC', TZ)).toEqual({ publishNow: true });
  });

  it('queues', () => {
    expect(applyPublishMode({}, 'queue', null, null, TZ)).toEqual({
      publishNow: false,
      addToQueue: true,
    });
  });

  it('drafts', () => {
    expect(applyPublishMode({}, 'draft', null, null, TZ)).toEqual({
      isDraft: true,
      publishNow: false,
    });
  });

  it('preserves existing body fields', () => {
    const body = applyPublishMode({ content: 'hi' }, 'now', null, null, TZ);
    expect(body).toEqual({ content: 'hi', publishNow: true });
  });
});

describe('readPostResult', () => {
  it('reads the nested { post: { _id, platforms } } shape', () => {
    const res = {
      post: { _id: 'abc', platforms: [{ platformPostUrl: 'https://x.com/u/status/1' }] },
    };
    expect(readPostResult(res)).toEqual({ latePostId: 'abc', postUrl: 'https://x.com/u/status/1' });
  });

  it('reads a flat { _id, platforms } shape', () => {
    const res = { _id: 'xyz', platforms: [{ platformPostUrl: 'https://x.com/u/status/2' }] };
    expect(readPostResult(res)).toEqual({ latePostId: 'xyz', postUrl: 'https://x.com/u/status/2' });
  });

  it('returns undefined url when no platform has one', () => {
    const res = { post: { _id: 'abc', platforms: [{}] } };
    expect(readPostResult(res)).toEqual({ latePostId: 'abc', postUrl: undefined });
  });

  it('handles a missing post body', () => {
    expect(readPostResult({})).toEqual({ latePostId: undefined, postUrl: undefined });
  });
});

describe('resolveTargetsFromMappings', () => {
  const accountToModel = {
    accA: { modelName: 'Aria' },
    accB: { modelName: 'Bella' },
  };

  it('keeps only twitter/x mappings and attaches model names + key index', () => {
    const mappings: MappingRow[] = [
      { lateAccountId: 'accA', platform: 'twitter', apiKeyIndex: 0 },
      { lateAccountId: 'accB', platform: 'x', apiKeyIndex: 2 },
      { lateAccountId: 'accC', platform: 'instagram', apiKeyIndex: 0 },
    ];
    expect(resolveTargetsFromMappings(mappings, accountToModel)).toEqual([
      { accountId: 'accA', apiKeyIndex: 0, modelName: 'Aria' },
      { accountId: 'accB', apiKeyIndex: 2, modelName: 'Bella' },
    ]);
  });

  it('dedupes the same account across models', () => {
    const mappings: MappingRow[] = [
      { lateAccountId: 'accA', platform: 'twitter', apiKeyIndex: 0 },
      { lateAccountId: 'accA', platform: 'twitter', apiKeyIndex: 0 },
    ];
    expect(resolveTargetsFromMappings(mappings, accountToModel)).toHaveLength(1);
  });

  it('defaults a null apiKeyIndex to 0', () => {
    const mappings: MappingRow[] = [{ lateAccountId: 'accA', platform: 'twitter', apiKeyIndex: null }];
    expect(resolveTargetsFromMappings(mappings, accountToModel)[0].apiKeyIndex).toBe(0);
  });

  it('appends legacy account IDs not already covered', () => {
    const mappings: MappingRow[] = [{ lateAccountId: 'accA', platform: 'twitter', apiKeyIndex: 0 }];
    const targets = resolveTargetsFromMappings(mappings, accountToModel, ['accA', 'accB']);
    // accA already present via mapping; only accB added from legacy list.
    expect(targets.map((t) => t.accountId)).toEqual(['accA', 'accB']);
  });

  it('returns empty when nothing resolves', () => {
    expect(resolveTargetsFromMappings([], {}, [])).toEqual([]);
  });
});

// ── preprocessSteps (media merge) ──

function tweetStep(id: string, content = 'hi', mediaUrls?: string[]): TwitterPipelineStep {
  return { id, type: 'tweet', enabled: true, config: { content, mode: 'manual', mediaUrls } as TwitterTweetConfig };
}
function mediaStep(id: string, mediaUrl: string, attachToStepId?: string): TwitterPipelineStep {
  return { id, type: 'media', enabled: true, config: { source: 'upload', mediaUrl, attachToStepId } as TwitterMediaConfig };
}

describe('preprocessSteps', () => {
  it('drops disabled steps', () => {
    const steps = [tweetStep('a'), { ...tweetStep('b'), enabled: false }];
    const out = preprocessSteps(steps);
    expect(out.map((s) => s.id)).toEqual(['a']);
  });

  it('removes media steps from the postable output', () => {
    const steps = [tweetStep('a'), mediaStep('m', 'https://r2/x.png', 'a')];
    const out = preprocessSteps(steps);
    expect(out.map((s) => s.type)).toEqual(['tweet']);
  });

  it('merges media into the targeted step by attachToStepId', () => {
    const steps = [tweetStep('a'), tweetStep('b'), mediaStep('m', 'https://r2/x.png', 'b')];
    const out = preprocessSteps(steps);
    const b = out.find((s) => s.id === 'b')!;
    expect((b.config as TwitterTweetConfig).mediaUrls).toEqual(['https://r2/x.png']);
    expect((out.find((s) => s.id === 'a')!.config as TwitterTweetConfig).mediaUrls).toBeUndefined();
  });

  it('attaches to the nearest preceding content step when no target is set', () => {
    const steps = [tweetStep('a'), tweetStep('b'), mediaStep('m', 'https://r2/x.png')];
    const out = preprocessSteps(steps);
    expect((out.find((s) => s.id === 'b')!.config as TwitterTweetConfig).mediaUrls).toEqual([
      'https://r2/x.png',
    ]);
  });

  it('appends to existing media on the target', () => {
    const steps = [tweetStep('a', 'hi', ['existing.png']), mediaStep('m', 'new.png', 'a')];
    const out = preprocessSteps(steps);
    expect((out[0].config as TwitterTweetConfig).mediaUrls).toEqual(['existing.png', 'new.png']);
  });

  it('merges media into the first item of a thread', () => {
    const thread: TwitterPipelineStep = {
      id: 't',
      type: 'thread',
      enabled: true,
      config: { items: [{ id: 'i1', content: 'one' }, { id: 'i2', content: 'two' }], mode: 'manual' } as TwitterThreadConfig,
    };
    const out = preprocessSteps([thread, mediaStep('m', 'pic.png', 't')]);
    expect((out[0].config as TwitterThreadConfig).items[0].mediaUrls).toEqual(['pic.png']);
  });

  it('does not mutate the original steps', () => {
    const original = [tweetStep('a'), mediaStep('m', 'pic.png', 'a')];
    preprocessSteps(original);
    expect((original[0].config as TwitterTweetConfig).mediaUrls).toBeUndefined();
  });

  it('ignores a media step with no mediaUrl', () => {
    const steps = [tweetStep('a'), mediaStep('m', '', 'a')];
    const out = preprocessSteps(steps);
    expect((out[0].config as TwitterTweetConfig).mediaUrls).toBeUndefined();
  });
});
