'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useModels } from '@/hooks/useModels';
import { useBatches } from '@/hooks/useBatches';
import SingleVideoForm from '@/components/generate/SingleVideoForm';
import BulkGenerateForm from '@/components/generate/BulkGenerateForm';

function GeneratePageContent() {
  const searchParams = useSearchParams();
  const { models, modelImages, setModelImages, loadModelImages } = useModels();
  const { batches, refresh: refreshBatches } = useBatches();

  const [bulkMode, setBulkMode] = useState(false);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('bulkMode') === 'true') {
      setBulkMode(true);
    }
  }, [searchParams]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadedImagePath(data.url || data.path);
      }
    } catch {
      // handled silently
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-[var(--primary)]">Generate Videos</h1>
      <p className="mb-6 text-[var(--text-muted)]">Create AI-powered UGC videos from TikTok content</p>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setBulkMode(false)}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${!bulkMode ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)] hover:bg-[var(--background)]'}`}
        >
          Single Video
        </button>
        <button
          onClick={() => setBulkMode(true)}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${bulkMode ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)] hover:bg-[var(--background)]'}`}
        >
          Bulk Generate
        </button>
      </div>

      {!bulkMode ? (
        <SingleVideoForm
          models={models}
          modelImages={modelImages}
          loadModelImages={loadModelImages}
        />
      ) : (
        <BulkGenerateForm
          models={models}
          modelImages={modelImages}
          batches={batches}
          loadModelImages={loadModelImages}
          setModelImages={setModelImages}
          loadBatches={refreshBatches}
          uploadedImagePath={uploadedImagePath}
          setUploadedImagePath={setUploadedImagePath}
          handleImageUpload={handleImageUpload}
        />
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense>
      <GeneratePageContent />
    </Suspense>
  );
}
