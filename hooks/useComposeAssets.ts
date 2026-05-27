'use client';

import { useCallback, useRef, useState } from 'react';
import type { Model } from '@/types';

export type VideoItem = { url: string; gcsUrl: string; name: string };
export type ImageItem = { url: string; gcsUrl: string; name: string };
export type ModelItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  images: { gcsUrl: string; signedUrl?: string; filename: string }[];
};
export type JobBatchItem = {
  id: string;
  name?: string;
  status?: string;
  isMaster?: boolean;
  totalJobs?: number;
  completedJobs?: number;
  createdAt?: string;
};
export type ExpandedJob = {
  id: string;
  name?: string;
  status?: string;
  outputUrl?: string;
  signedUrl?: string;
};
export type UploadedAsset = {
  url: string;
  gcsUrl: string;
  isVideo: boolean;
};

const VIDEOS_PER_PAGE = 40;
const IMAGES_PER_PAGE = 40;

// Owns every fetch in ComposeAssetPanel — tab-keyed lazy loads, per-model
// drill-down, jobs list, batch expand, and the upload endpoint. Pagination
// state and load-once refs live here so the consumer just calls the methods.
export function useComposeAssets() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelGenImages, setModelGenImages] = useState<Map<string, ImageItem[]>>(new Map());
  const [modelGenVideos, setModelGenVideos] = useState<Map<string, VideoItem[]>>(new Map());
  const [jobBatches, setJobBatches] = useState<JobBatchItem[]>([]);
  const [standaloneJobs, setStandaloneJobs] = useState<{ id: string; name?: string; outputUrl?: string }[]>([]);
  const [expandedBatchJobs, setExpandedBatchJobs] = useState<ExpandedJob[]>([]);

  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingModelImages, setIsLoadingModelImages] = useState(false);
  const [isLoadingModelGenContent, setIsLoadingModelGenContent] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingBatchJobs, setIsLoadingBatchJobs] = useState(false);
  const [isLoadingMoreVideos, setIsLoadingMoreVideos] = useState(false);
  const [isLoadingMoreImages, setIsLoadingMoreImages] = useState(false);

  const [hasMoreVideos, setHasMoreVideos] = useState(false);
  const [hasMoreImages, setHasMoreImages] = useState(false);

  const videosPageRef = useRef(1);
  const imagesPageRef = useRef(1);
  const videosLoaded = useRef(false);
  const imagesLoaded = useRef(false);
  const modelsLoaded = useRef(false);
  const jobsLoaded = useRef(false);

  const loadVideos = useCallback(async (loadMore = false) => {
    if (!loadMore && (videosLoaded.current || isLoadingVideos)) return;
    if (loadMore) {
      setIsLoadingMoreVideos(true);
    } else {
      setIsLoadingVideos(true);
      videosLoaded.current = true;
      videosPageRef.current = 1;
    }
    try {
      const res = await fetch('/api/videos?mode=generated');
      const data = await res.json();
      const rawVideos = data.videos;
      if (!Array.isArray(rawVideos)) return;

      const page = videosPageRef.current;
      const start = loadMore ? (page - 1) * VIDEOS_PER_PAGE : 0;
      const end = page * VIDEOS_PER_PAGE;
      const pageVideos = rawVideos.slice(start, end);

      const items: VideoItem[] = pageVideos.map((v: { url?: string; path?: string; name?: string }) => {
        const gcsUrl = v.url || v.path || '';
        return { gcsUrl, url: gcsUrl, name: v.name || 'Video' };
      });

      setVideos((prev) => (loadMore ? [...prev, ...items] : items));
      setHasMoreVideos(rawVideos.length > end);
      videosPageRef.current = page + 1;
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setIsLoadingVideos(false);
      setIsLoadingMoreVideos(false);
    }
  }, [isLoadingVideos]);

  const loadImages = useCallback(async (loadMore = false) => {
    if (!loadMore && (imagesLoaded.current || isLoadingImages)) return;
    if (loadMore) {
      setIsLoadingMoreImages(true);
    } else {
      setIsLoadingImages(true);
      imagesLoaded.current = true;
      imagesPageRef.current = 1;
    }
    try {
      const page = imagesPageRef.current;
      const res = await fetch(`/api/generated-images?page=${page}&limit=${IMAGES_PER_PAGE}&signed=true`);
      const data = await res.json();
      const rawImages = data.images;
      if (!Array.isArray(rawImages)) return;

      const items: ImageItem[] = rawImages.map((img: { gcsUrl?: string; signedUrl?: string; filename?: string }) => {
        const gcsUrl = img.gcsUrl || '';
        return { gcsUrl, url: img.signedUrl || gcsUrl, name: img.filename || 'Image' };
      });

      setImages((prev) => (loadMore ? [...prev, ...items] : items));
      const total = data.total ?? 0;
      setHasMoreImages(page * IMAGES_PER_PAGE < total);
      imagesPageRef.current = page + 1;
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setIsLoadingImages(false);
      setIsLoadingMoreImages(false);
    }
  }, [isLoadingImages]);

  const loadModels = useCallback(async () => {
    if (modelsLoaded.current || isLoadingModels) return;
    setIsLoadingModels(true);
    modelsLoaded.current = true;
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const rawModels: Model[] = Array.isArray(data) ? data : [];
      setModels(rawModels.map((m) => ({
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl || undefined,
        images: [],
      })));
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  }, [isLoadingModels]);

  const loadModelImages = useCallback(async (modelId: string) => {
    setIsLoadingModelImages(true);
    try {
      const res = await fetch(`/api/models/${modelId}/images`);
      const data = await res.json();
      const rawImages: { gcsUrl: string; signedUrl?: string; filename: string }[] = Array.isArray(data) ? data : [];
      const withSigned = rawImages.map((img) => ({
        ...img,
        signedUrl: img.signedUrl || img.gcsUrl,
      }));
      setModels((prev) => prev.map((m) =>
        m.id === modelId ? { ...m, images: withSigned } : m,
      ));
    } catch (err) {
      console.error('Failed to load model images:', err);
    } finally {
      setIsLoadingModelImages(false);
    }
  }, []);

  const loadModelGenContent = useCallback(async (modelId: string) => {
    setIsLoadingModelGenContent(true);
    try {
      const [imgRes, vidRes] = await Promise.all([
        fetch(`/api/generated-images?modelId=${modelId}&limit=20&signed=true`),
        fetch('/api/videos?mode=generated'),
      ]);
      const imgData = await imgRes.json();
      const vidData = await vidRes.json();

      const rawImgs = Array.isArray(imgData.images) ? imgData.images : [];
      const genImgs: ImageItem[] = rawImgs.map((img: { gcsUrl?: string; signedUrl?: string; filename?: string }) => ({
        gcsUrl: img.gcsUrl || '',
        url: img.signedUrl || img.gcsUrl || '',
        name: img.filename || 'Generated Image',
      }));
      setModelGenImages((prev) => new Map(prev).set(modelId, genImgs));

      const rawVids = Array.isArray(vidData.videos) ? vidData.videos : [];
      const genVids: VideoItem[] = rawVids
        .filter((v: { modelId?: string }) => v.modelId === modelId)
        .slice(0, 20)
        .map((v: { url?: string; path?: string; name?: string }) => ({
          gcsUrl: v.url || v.path || '',
          url: v.url || v.path || '',
          name: v.name || 'Generated Video',
        }));
      setModelGenVideos((prev) => new Map(prev).set(modelId, genVids));
    } catch (err) {
      console.error('Failed to load model generated content:', err);
    } finally {
      setIsLoadingModelGenContent(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    if (jobsLoaded.current || isLoadingJobs) return;
    setIsLoadingJobs(true);
    jobsLoaded.current = true;
    try {
      const res = await fetch('/api/compose-jobs');
      const data = await res.json();
      if (Array.isArray(data.batches)) setJobBatches(data.batches);
      if (Array.isArray(data.standaloneJobs)) setStandaloneJobs(data.standaloneJobs);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [isLoadingJobs]);

  const loadBatchJobs = useCallback(async (batchId: string) => {
    setIsLoadingBatchJobs(true);
    setExpandedBatchJobs([]);
    try {
      const res = await fetch(`/api/pipeline-batches/${batchId}`);
      const data = await res.json();
      if (Array.isArray(data.jobs)) {
        setExpandedBatchJobs(data.jobs);
      }
    } catch (err) {
      console.error('Failed to load batch jobs:', err);
    } finally {
      setIsLoadingBatchJobs(false);
    }
  }, []);

  // Returns the uploaded asset on success, or throws so the caller can show
  // a banner with the error message instead of a generic toast.
  const uploadFile = useCallback(async (file: File): Promise<UploadedAsset> => {
    const isVideo = file.type.startsWith('video/');
    const formData = new FormData();
    formData.append(isVideo ? 'video' : 'image', file);
    const endpoint = isVideo ? '/api/upload-video' : '/api/upload-image';
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    const displayUrl = data.url || data.gcsUrl;
    const gcsUrl = data.gcsUrl || data.url;
    if (!displayUrl) {
      throw new Error('Upload succeeded but no URL returned');
    }
    return { url: displayUrl, gcsUrl, isVideo };
  }, []);

  return {
    // data
    videos,
    images,
    models,
    modelGenImages,
    modelGenVideos,
    jobBatches,
    standaloneJobs,
    expandedBatchJobs,
    // flags
    isLoadingVideos,
    isLoadingImages,
    isLoadingModels,
    isLoadingModelImages,
    isLoadingModelGenContent,
    isLoadingJobs,
    isLoadingBatchJobs,
    isLoadingMoreVideos,
    isLoadingMoreImages,
    hasMoreVideos,
    hasMoreImages,
    // actions
    loadVideos,
    loadImages,
    loadModels,
    loadModelImages,
    loadModelGenContent,
    loadJobs,
    loadBatchJobs,
    uploadFile,
  };
}
