'use client';

import { useState } from 'react';
import { ExternalLink, Film, ChevronDown, ChevronUp } from 'lucide-react';
import { RUNABLE_INTEGRATION_VARIABLE_NAME } from '@/lib/runable-integration';

type RunablePost = {
  postId: string;
  content: string;
  publishedAt: string;
  platformPostUrl?: string;
  thumbnailUrl?: string;
  platforms: { platform: string; accountUsername: string }[];
  analytics: {
    views: number;
    likes: number;
    comments: number;
  };
};

function formatDate(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time <= 0) return 'Unknown date';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

const COLLAPSED_COUNT = 6;

export default function LateRunnableVideosPanel({ posts }: { posts: RunablePost[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!posts.length) return null;

  const hasMore = posts.length > COLLAPSED_COUNT;
  const visiblePosts = expanded ? posts : posts.slice(0, COLLAPSED_COUNT);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Tagged Videos</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {posts.length} posted social video{posts.length === 1 ? '' : 's'} in this range have {RUNABLE_INTEGRATION_VARIABLE_NAME} enabled.
            The charts above are calculated from these same tagged posts.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <Film className="h-3.5 w-3.5" />
          Runable Toggle On
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visiblePosts.map((post) => {
          const mainPlatform = post.platforms[0];
          return (
          <div key={post.postId} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                  {post.thumbnailUrl ? (
                    <img src={post.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">{post.content?.slice(0, 52) || 'Untitled video'}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{formatDate(post.publishedAt)}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {mainPlatform?.platform || 'Social'} {mainPlatform?.accountUsername ? `@${mainPlatform.accountUsername}` : ''}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Runable
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-[var(--text-muted)]">
                {formatNum(post.analytics.views || 0)} views · {formatNum(post.analytics.likes || 0)} likes · {formatNum(post.analytics.comments || 0)} comments
              </span>
              {post.platformPostUrl ? (
                <a
                  href={post.platformPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                >
                  Open
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        )})}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          {expanded ? (
            <>
              Show Less
              <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Show All {posts.length} Videos
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
