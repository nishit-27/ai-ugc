type MaybeStatus = string | null | undefined;

type PlatformLike = {
  status?: MaybeStatus;
  platformPostUrl?: string | null;
};

type PostLike = {
  status?: MaybeStatus;
  platforms?: PlatformLike[] | null;
};

export type UiPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'partial' | 'cancelled';

const ACTIVE_PLATFORM_STATUSES = new Set(['pending', 'publishing', 'processing', 'in_progress']);

function normalizeStatus(status: MaybeStatus): string {
  return (status || '').toLowerCase().trim();
}

export function isActiveStatus(status: MaybeStatus): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'publishing' || normalized === 'processing' || normalized === 'in_progress' || normalized === 'pending';
}

export function derivePostStatus(post: PostLike): UiPostStatus {
  const topLevel = normalizeStatus(post.status);
  const platformStatuses = (post.platforms || [])
    .map((platform) => normalizeStatus(platform.status))
    .filter(Boolean);

  const hasPublished = platformStatuses.includes('published');
  const hasFailed = platformStatuses.includes('failed');
  const hasActive = platformStatuses.some((status) => ACTIVE_PLATFORM_STATUSES.has(status));

  // Active states must win so retries for partial/failed posts render as publishing.
  if (hasActive || isActiveStatus(topLevel)) return 'publishing';

  if (hasPublished && hasFailed) return 'partial';
  if (hasFailed && !hasPublished) return 'failed';
  if (hasPublished && !hasFailed && !hasActive) return 'published';

  if (topLevel === 'scheduled') return 'scheduled';
  if (topLevel === 'draft') return 'draft';
  if (topLevel === 'partial') return 'partial';
  if (topLevel === 'failed') return 'failed';
  if (topLevel === 'published') return 'published';
  if (topLevel === 'cancelled') return 'cancelled';

  if (platformStatuses.length > 0 && platformStatuses.every((status) => status === 'scheduled')) return 'scheduled';

  return 'draft';
}

export function hasPublishedPlatformWithoutUrl(post: PostLike): boolean {
  const topLevelStatus = normalizeStatus(post.status);
  return (post.platforms || []).some((platform) => {
    const status = normalizeStatus(platform.status || topLevelStatus);
    return status === 'published' && !platform.platformPostUrl;
  });
}

export function statusMatchesFilter(status: UiPostStatus, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'failed') return status === 'failed' || status === 'partial';
  return status === filter;
}

export function postMatchesFilter(post: PostLike, filter: string): boolean {
  return statusMatchesFilter(derivePostStatus(post), filter);
}
