'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePosts } from '@/hooks/usePosts';
import RefreshButton from '@/components/ui/RefreshButton';
import PostFilters from '@/components/posts/PostFilters';
import PostList from '@/components/posts/PostList';
import CreatePostModal from '@/components/posts/CreatePostModal';
import VideoPreviewModal from '@/components/posts/VideoPreviewModal';

function PostsPageContent() {
  const searchParams = useSearchParams();
  const { posts, postsFilter, setPostsFilter, isLoadingPage, refresh } = usePosts();

  const [createPostModal, setCreatePostModal] = useState(false);
  const [preselectedVideoUrl, setPreselectedVideoUrl] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<{ url: string; caption: string } | null>(null);

  useEffect(() => {
    if (searchParams.get('createPost') === 'true') {
      const videoUrl = searchParams.get('videoUrl');
      if (videoUrl) setPreselectedVideoUrl(videoUrl);
      setCreatePostModal(true);
    }
  }, [searchParams]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">Posts</h1>
          <p className="text-[var(--text-muted)]">Manage scheduled and published content</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton onClick={refresh} />
          <button
            type="button"
            onClick={() => {
              setPreselectedVideoUrl(null);
              setCreatePostModal(true);
            }}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            + Create Post
          </button>
        </div>
      </div>

      <PostFilters postsFilter={postsFilter} setPostsFilter={setPostsFilter} />

      <PostList
        posts={posts}
        isLoading={isLoadingPage}
        refresh={refresh}
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
    </div>
  );
}

export default function PostsPage() {
  return (
    <Suspense>
      <PostsPageContent />
    </Suspense>
  );
}
