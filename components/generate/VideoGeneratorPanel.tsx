'use client';

import { useState, useEffect, useRef } from 'react';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/hooks/useToast';

type VideoModelOption = {
  id: string;
  label: string;
  supports: ('prompt' | 'image')[];
};

type GenerationState = 'idle' | 'uploading' | 'generating' | 'done' | 'error';

export default function VideoGeneratorPanel() {
  const { showToast } = useToast();
  const [models, setModels] = useState<VideoModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState('5');
  const [state, setState] = useState<GenerationState>('idle');
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load available models
  useEffect(() => {
    fetch('/api/generate-video')
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        if (data.models?.length > 0) setSelectedModel(data.models[0].id);
      })
      .catch(console.error);
  }, []);

  const currentModel = models.find((m) => m.id === selectedModel);
  const supportsImage = currentModel?.supports.includes('image') ?? false;
  const requiresImage = currentModel ? !currentModel.supports.includes('prompt') : false;

  // Timer for generation elapsed time
  useEffect(() => {
    if (state === 'generating') {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview
    setImagePreview(URL.createObjectURL(file));
    setImageName(file.name);
    setState('uploading');

    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setImageUrl(data.url || data.path);
        setState('idle');
      } else {
        showToast('Image upload failed', 'error');
        setState('idle');
      }
    } catch {
      showToast('Image upload failed', 'error');
      setState('idle');
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please drop an image file', 'error');
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    setImageName(file.name);
    setState('uploading');

    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setImageUrl(data.url || data.path);
        setState('idle');
      } else {
        showToast('Image upload failed', 'error');
        setState('idle');
      }
    } catch {
      showToast('Image upload failed', 'error');
      setState('idle');
    }
  };

  const clearImage = () => {
    setImageUrl(null);
    setImagePreview(null);
    setImageName(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please enter a prompt', 'error');
      return;
    }
    if (requiresImage && !imageUrl) {
      showToast('This model requires an image', 'error');
      return;
    }

    setState('generating');
    setResultVideoUrl(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedModel,
          prompt: prompt.trim(),
          imageUrl: imageUrl || undefined,
          aspectRatio,
          duration,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultVideoUrl(data.videoUrl);
        setState('done');
        showToast('Video generated!', 'success');
      } else {
        setErrorMsg(data.error || 'Generation failed');
        setState('error');
        showToast(data.error || 'Generation failed', 'error');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState('error');
      showToast('Generation failed', 'error');
    }
  };

  const handleReset = () => {
    setState('idle');
    setResultVideoUrl(null);
    setErrorMsg(null);
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left: Form */}
      <div className="space-y-5">
        {/* Model selector */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Video Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={state === 'generating'}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.supports.join(' + ')}
              </option>
            ))}
          </select>
        </div>

        {/* Image upload */}
        {supportsImage && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Reference Image {requiresImage ? '(Required)' : '(Optional)'}
            </label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Reference" className="h-32 w-auto rounded-xl border border-[var(--border)] object-cover" />
                <button
                  onClick={clearImage}
                  className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-lg hover:bg-red-600"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                {state === 'uploading' && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                    <Spinner className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{imageName}</div>
              </div>
            ) : (
              <label
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] py-8 transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <svg className="h-8 w-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="mt-2 text-sm font-medium text-[var(--text)]">Upload image</span>
                <span className="text-[11px] text-[var(--text-muted)]">Drag & drop or click to browse</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={state === 'generating'} />
              </label>
            )}
          </div>
        )}

        {/* Prompt */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video you want to generate..."
            rows={5}
            disabled={state === 'generating'}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
          />
        </div>

        {/* Settings row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Aspect Ratio</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={state === 'generating'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
            >
              <option value="9:16">9:16 (Portrait)</option>
              <option value="16:9">16:9 (Landscape)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={state === 'generating'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
            >
              <option value="4">4 seconds</option>
              <option value="5">5 seconds</option>
              <option value="6">6 seconds</option>
              <option value="8">8 seconds</option>
              <option value="10">10 seconds</option>
            </select>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={state === 'generating' || state === 'uploading' || !prompt.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'generating' ? (
            <>
              <Spinner className="h-4 w-4" />
              Generating... ({formatElapsed(elapsedSeconds)})
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Generate Video
            </>
          )}
        </button>
      </div>

      {/* Right: Preview / Skeleton */}
      <div className="flex flex-col">
        <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Preview</label>
        <div className={`flex flex-1 items-center justify-center rounded-2xl border-2 ${
          state === 'generating'
            ? 'border-[var(--primary)] bg-[var(--accent)]'
            : state === 'done'
              ? 'border-emerald-400 bg-emerald-50/50'
              : state === 'error'
                ? 'border-red-300 bg-red-50/50'
                : 'border-dashed border-[var(--border)] bg-[var(--surface)]'
        }`} style={{ minHeight: 400 }}>

          {state === 'idle' && !resultVideoUrl && (
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <div className="rounded-full bg-[var(--accent)] p-4">
                <svg className="h-10 w-10 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-sm font-medium text-[var(--text-muted)]">Your generated video will appear here</div>
              <div className="text-xs text-[var(--text-muted)]">Select a model, write a prompt, and optionally upload an image</div>
            </div>
          )}

          {state === 'generating' && (
            <div className="flex flex-col items-center gap-4 px-6">
              {/* Skeleton animation */}
              <div className="relative">
                <div className="h-56 w-36 animate-pulse rounded-xl bg-gradient-to-br from-[var(--primary)]/20 via-[var(--primary)]/10 to-[var(--primary)]/20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <Spinner className="h-10 w-10 text-[var(--primary)]" />
                  </div>
                </div>
                {/* Shimmer overlay */}
                <div className="absolute inset-0 overflow-hidden rounded-xl">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-[var(--primary)]">Generating with {currentModel?.label}...</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{formatElapsed(elapsedSeconds)} elapsed — this can take 1-5 minutes</div>
              </div>
              {/* Progress steps */}
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span className={elapsedSeconds >= 0 ? 'text-[var(--primary)] font-medium' : ''}>Queued</span>
                <span>→</span>
                <span className={elapsedSeconds >= 5 ? 'text-[var(--primary)] font-medium' : ''}>Processing</span>
                <span>→</span>
                <span className={elapsedSeconds >= 30 ? 'text-[var(--primary)] font-medium' : ''}>Rendering</span>
                <span>→</span>
                <span>Done</span>
              </div>
            </div>
          )}

          {state === 'done' && resultVideoUrl && (
            <div className="flex w-full flex-col items-center gap-3 p-4">
              <video
                src={resultVideoUrl}
                controls
                autoPlay
                loop
                className="max-h-[400px] w-full rounded-xl object-contain"
              />
              <div className="flex items-center gap-2">
                <a
                  href={resultVideoUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download
                </a>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Generate Another
                </button>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="rounded-full bg-red-100 p-3">
                <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.832c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div className="text-sm font-medium text-red-700">{errorMsg || 'Generation failed'}</div>
              <button
                onClick={handleReset}
                className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-600"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
