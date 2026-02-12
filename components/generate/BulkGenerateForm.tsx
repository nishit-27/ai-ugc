'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Model, ModelImage, Batch } from '@/types';
import { useToast } from '@/hooks/useToast';
import Spinner from '@/components/ui/Spinner';

export default function BulkGenerateForm({
  models,
  modelImages,
  batches,
  loadModelImages,
  setModelImages,
  loadBatches,
  uploadedImagePath,
  setUploadedImagePath,
  handleImageUpload,
}: {
  models: Model[];
  modelImages: ModelImage[];
  batches: Batch[];
  loadModelImages: (modelId: string) => Promise<void>;
  setModelImages: (images: ModelImage[]) => void;
  loadBatches: () => Promise<void>;
  uploadedImagePath: string | null;
  setUploadedImagePath: (path: string | null) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [bulkUrls, setBulkUrls] = useState('');
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);
  const [selectedModelForGenerate, setSelectedModelForGenerate] = useState('');
  const [imageSelectionMode, setImageSelectionMode] = useState<'all' | 'specific'>('all');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState('');
  const [maxSeconds, setMaxSeconds] = useState(10);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [isParsingCsv, setIsParsingCsv] = useState(false);

  const handleParseBulkUrls = async () => {
    if (!bulkUrls.trim()) {
      setParsedUrls([]);
      return;
    }
    try {
      const res = await fetch('/api/parse-tiktok-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bulkUrls }),
      });
      const data = await res.json();
      setParsedUrls(data.urls || []);
      if (data.duplicates > 0) {
        showToast(`Found ${data.urls.length} URLs (${data.duplicates} duplicates removed)`, 'success');
      }
    } catch (e) {
      console.error('Failed to parse URLs:', e);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingCsv(true);
    const formData = new FormData();
    formData.append('csv', file);
    try {
      const res = await fetch('/api/parse-tiktok-urls', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setParsedUrls(data.urls || []);
      showToast(`Loaded ${data.urls.length} URLs from CSV`, 'success');
    } catch {
      showToast('Failed to parse CSV', 'error');
    } finally {
      setIsParsingCsv(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (parsedUrls.length === 0) {
      showToast('No video URLs to generate', 'error');
      return;
    }
    if (!selectedModelForGenerate && !uploadedImagePath) {
      showToast('Please select a model or upload an image', 'error');
      return;
    }

    setIsBulkGenerating(true);
    try {
      const body: Record<string, unknown> = {
        name: batchName || `Batch ${new Date().toLocaleString()}`,
        tiktokUrls: parsedUrls,
        maxSeconds,
      };

      if (selectedModelForGenerate) {
        if (imageSelectionMode === 'all') {
          body.modelId = selectedModelForGenerate;
        } else {
          body.imageIds = selectedImageIds;
        }
      } else {
        body.imageUrl = uploadedImagePath;
      }

      const res = await fetch('/api/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`Started batch with ${data.count} jobs!`, 'success');
        setBulkUrls('');
        setParsedUrls([]);
        setBatchName('');
        loadBatches();
        router.push('/batches');
      } else {
        showToast(data.error || 'Failed to start batch', 'error');
      }
    } catch (e) {
      showToast('Error: ' + (e as Error).message, 'error');
    } finally {
      setIsBulkGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        {/* Bulk URL Input */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h3 className="mb-4 text-lg font-semibold">Video URLs</h3>
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              Paste TikTok or Instagram URLs (one per line or comma-separated)
            </label>
            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              onBlur={handleParseBulkUrls}
              placeholder={"https://www.tiktok.com/@user/video/123...\nhttps://www.instagram.com/reel/abc..."}
              className="min-h-[150px] w-full resize-y rounded-lg border border-[var(--border)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className={`inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm ${
              isParsingCsv ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-[var(--background)]'
            }`}>
              {isParsingCsv ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Parsing...
                </>
              ) : (
                'Upload CSV'
              )}
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} disabled={isParsingCsv} />
            </label>
            <span className="text-sm text-[var(--text-muted)]">
              {parsedUrls.length > 0 ? `${parsedUrls.length} URLs ready` : 'No URLs parsed'}
            </span>
          </div>
        </div>

        {/* Model Selection */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h3 className="mb-4 text-lg font-semibold">Model Selection</h3>
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Select Model</label>
            <select
              value={selectedModelForGenerate}
              onChange={(e) => {
                setSelectedModelForGenerate(e.target.value);
                if (e.target.value) {
                  loadModelImages(e.target.value);
                } else {
                  setModelImages([]);
                }
              }}
              className="w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm"
            >
              <option value="">Select a model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.imageCount || 0} images)</option>
              ))}
            </select>
          </div>

          {selectedModelForGenerate && (
            <>
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setImageSelectionMode('all')}
                  className={`rounded-lg px-3 py-2 text-sm ${imageSelectionMode === 'all' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)]'}`}
                >
                  Use All (Random)
                </button>
                <button
                  onClick={() => setImageSelectionMode('specific')}
                  className={`rounded-lg px-3 py-2 text-sm ${imageSelectionMode === 'specific' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)]'}`}
                >
                  Select Specific
                </button>
              </div>

              {imageSelectionMode === 'specific' && modelImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {modelImages.map((img) => (
                    <label key={img.id} className="relative cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedImageIds.includes(img.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedImageIds((prev) => [...prev, img.id]);
                          } else {
                            setSelectedImageIds((prev) => prev.filter((id) => id !== img.id));
                          }
                        }}
                        className="absolute left-2 top-2 z-10"
                      />
                      <img
                        src={img.signedUrl || img.gcsUrl}
                        alt=""
                        className={`h-20 w-full rounded-lg object-cover ${selectedImageIds.includes(img.id) ? 'ring-2 ring-[var(--primary)]' : ''}`}
                      />
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {!selectedModelForGenerate && (
            <div className="text-center text-sm text-[var(--text-muted)]">
              <p className="mb-2">Or upload a single image:</p>
              <label className="cursor-pointer rounded-lg border-2 border-dashed border-[var(--border)] p-4 hover:bg-[var(--background)] inline-block">
                {uploadedImagePath ? (
                  <img src={uploadedImagePath} alt="" className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                  <span>+ Upload</span>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Generate Settings & Preview */}
      <div className="space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h3 className="mb-4 text-lg font-semibold">Generation Settings</h3>
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Batch Name (optional)</label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="My Batch"
              className="w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm"
            />
          </div>
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              Max Duration: <span>{maxSeconds}</span>s
            </label>
            <input
              type="range"
              min={5}
              max={30}
              value={maxSeconds}
              onChange={(e) => setMaxSeconds(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="mb-4 rounded-lg bg-[var(--background)] p-4">
            <h4 className="mb-2 font-medium">Summary</h4>
            <ul className="space-y-1 text-sm text-[var(--text-muted)]">
              <li>Videos: {parsedUrls.length}</li>
              <li>Model: {selectedModelForGenerate ? models.find((m) => m.id === selectedModelForGenerate)?.name : 'Single image'}</li>
              <li>Images: {imageSelectionMode === 'all' ? modelImages.length || 1 : selectedImageIds.length || 1}</li>
              <li>Duration: {maxSeconds}s max</li>
            </ul>
          </div>

          <button
            onClick={handleBulkGenerate}
            disabled={parsedUrls.length === 0 || (!selectedModelForGenerate && !uploadedImagePath) || isBulkGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBulkGenerating ? (
              <>
                <Spinner />
                Starting Batch...
              </>
            ) : (
              `Generate ${parsedUrls.length} Videos`
            )}
          </button>
        </div>

        {/* Recent Batches */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent Batches</h3>
            <Link href="/batches" className="text-sm text-[var(--primary)]">View all</Link>
          </div>
          {batches.slice(0, 3).map((batch) => (
            <div key={batch.id} className="mb-2 rounded-lg bg-[var(--background)] p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{batch.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  batch.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                  batch.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                  'bg-[var(--warning-bg)] text-[var(--warning)]'
                }`}>
                  {batch.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {batch.completedJobs}/{batch.totalJobs} completed
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${batch.progress || 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
