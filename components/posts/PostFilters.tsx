'use client';

const FILTERS = [
  { key: 'all', label: 'All Posts' },
  { key: 'published', label: 'Published' },
  { key: 'partial', label: 'Partial' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Draft' },
  { key: 'failed', label: 'Failed' },
  { key: 'duplicate', label: 'Duplicate' },
];

const FILTER_COLORS: Record<string, { active: string; inactive: string }> = {
  published: {
    active: 'border-emerald-500 bg-emerald-500 text-white',
    inactive: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
  },
  partial: {
    active: 'border-orange-500 bg-orange-500 text-white',
    inactive: 'border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30',
  },
  failed: {
    active: 'border-red-500 bg-red-500 text-white',
    inactive: 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30',
  },
  duplicate: {
    active: 'border-purple-500 bg-purple-500 text-white',
    inactive: 'border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/30',
  },
  scheduled: {
    active: 'border-blue-500 bg-blue-500 text-white',
    inactive: 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30',
  },
};

export default function PostFilters({
  postsFilter,
  setPostsFilter,
}: {
  postsFilter: string;
  setPostsFilter: (f: string) => void;
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
      {FILTERS.map(({ key, label }) => {
        const isActive = postsFilter === key;
        const colors = FILTER_COLORS[key];

        return (
          <button
            key={key}
            type="button"
            onClick={() => setPostsFilter(key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? colors?.active || 'border-[var(--primary)] bg-[var(--primary)] text-white'
                : colors?.inactive || 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--accent)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
