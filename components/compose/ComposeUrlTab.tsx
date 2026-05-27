'use client';

export default function ComposeUrlTab({
  urlInput,
  setUrlInput,
  onAdd,
}: {
  urlInput: string;
  setUrlInput: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Media URL</label>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://example.com/video.mp4"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
      </div>
      <button
        onClick={onAdd}
        disabled={!urlInput.trim()}
        className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
      >
        Add to Canvas
      </button>
      <p className="text-[10px] text-[var(--text-muted)]">
        Supports direct links to videos (.mp4, .webm) and images (.jpg, .png).
      </p>
    </div>
  );
}
