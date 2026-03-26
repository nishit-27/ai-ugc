'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePosts } from '@/hooks/usePosts';
import { useModelFilterOptions } from '@/hooks/useModelFilterOptions';
import ModelDateToolbar from '@/components/media/ModelDateToolbar';
import type { DateFilterValue } from '@/types/media-filters';
import PostFilters from '@/components/posts/PostFilters';
import PostList from '@/components/posts/PostList';
import CreatePostModal from '@/components/posts/CreatePostModal';
import VideoPreviewModal from '@/components/posts/VideoPreviewModal';
import PageTransition from '@/components/ui/PageTransition';

function PostsPageContent() {
  const searchParams = useSearchParams();
  const [modelFilter, setModelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('newest');
  const { models: modelOptions } = useModelFilterOptions();
  const { posts, postsFilter, setPostsFilter, isLoadingPage, refresh, duplicateIds, duplicateMap } = usePosts({
    modelId: modelFilter === 'all' ? undefined : modelFilter,
    dateFilter,
  });
  const startsOpen = searchParams.get('createPost') === 'true';
  const initialVideoUrl = startsOpen ? searchParams.get('videoUrl') : null;

  const [createPostModal, setCreatePostModal] = useState(startsOpen);
  const [preselectedVideoUrl, setPreselectedVideoUrl] = useState<string | null>(initialVideoUrl);
  const [videoPreview, setVideoPreview] = useState<{ url: string; caption: string } | null>(null);

  return (
    <PageTransition>
      <div className="mb-4 sm:mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--primary)] sm:text-2xl">Posts</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Manage scheduled and published content{posts.length > 0 && <span className="ml-1">({posts.length})</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPreselectedVideoUrl(null);
              setCreatePostModal(true);
            }}
            className="shrink-0 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] sm:px-4"
          >
            + Create Post
          </button>
        </div>
        <div className="mt-3">
          <ModelDateToolbar
            modelId={modelFilter}
            onModelChange={setModelFilter}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            modelOptions={modelOptions}
            onRefresh={refresh}
          />
        </div>
      </div>

      <PostFilters postsFilter={postsFilter} setPostsFilter={setPostsFilter} />

      <PostList
        posts={posts}
        isLoading={isLoadingPage}
        refresh={refresh}
        duplicateIds={duplicateIds}
        duplicateMap={duplicateMap}
        onCreatePost={() => {
          setPreselectedVideoUrl(null);
          setCreatePostModal(true);
        }}
      />

      <CreatePostModal
        open={createPostModal}
        onClose={() => setCreatePostModal(false)}
        onSubmitted={refresh}
        preselectedVideoUrl={preselectedVideoUrl}
      />

      <VideoPreviewModal video={videoPreview} onClose={() => setVideoPreview(null)} />
    </PageTransition>
  );
}

export default function PostsPage() {
  return (
    <Suspense>
      <PostsPageContent />
    </Suspense>
  );
}
