'use client';

import { Upload } from 'lucide-react';
import type { ChangeEvent, RefObject } from 'react';

export default function ComposeUploadTab({
  fileRef,
  isUploading,
  uploadError,
  onFileChange,
}: {
  fileRef: RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  uploadError: string | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="video/*,image/*" onChange={onFileChange} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={isUploading}
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] py-8 transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)]"
      >
        {isUploading ? (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
            <span className="text-xs text-[var(--text-muted)]">Uploading...</span>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">Click to upload video or image</span>
          </>
        )}
      </button>
      {uploadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {uploadError}
        </div>
      )}
    </div>
  );
}
