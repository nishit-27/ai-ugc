'use client';

import { useRef, useState } from 'react';
import { ImageIcon, X, Loader2 } from 'lucide-react';

const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

interface MediaAttachFieldProps {
  mediaUrls: string[];
  onChange: (urls: string[]) => void;
  onUpload: (file: File) => Promise<string | null>;
  label?: string;
  /** Icon-only trigger (used in compact action rows). */
  compact?: boolean;
}

export default function MediaAttachField({
  mediaUrls,
  onChange,
  onUpload,
  label = 'Media (optional)',
  compact = false,
}: MediaAttachFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const url = await onUpload(file);
      if (url) uploaded.push(url);
      else setError(`Failed to upload ${file.name}`);
    }
    if (uploaded.length) onChange([...mediaUrls, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (i: number) => onChange(mediaUrls.filter((_, j) => j !== i));

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*,video/mp4,video/quicktime,video/webm"
      multiple
      className="hidden"
      onChange={(e) => handleFiles(e.target.files)}
    />
  );

  if (compact) {
    return (
      <>
        {fileInput}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title="Attach media"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
        </button>
      </>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{label}</label>
      {fileInput}
      {mediaUrls.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {mediaUrls.map((url, i) => (
            <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)]">
              {VIDEO_RE.test(url) ? (
                <video src={url} className="h-full w-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] py-4 text-sm text-[var(--text-muted)] transition-colors hover:border-[#1DA1F2] hover:text-[#1DA1F2] disabled:opacity-60"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <ImageIcon className="h-4 w-4" />
            Add Media
          </>
        )}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
