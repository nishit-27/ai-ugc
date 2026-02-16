'use client';

export default function PostFilters({
  postsFilter,
  setPostsFilter,
}: {
  postsFilter: string;
  setPostsFilter: (f: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {['all', 'published', 'scheduled', 'draft', 'failed'].map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setPostsFilter(f)}
          className={`rounded-lg border px-3 py-2 text-xs capitalize sm:px-4 sm:text-sm ${
            postsFilter === f
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--background)]'
          }`}
        >
          {f === 'all' ? 'All posts' : f}
        </button>
      ))}
    </div>
  );
}
