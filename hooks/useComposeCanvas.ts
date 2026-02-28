'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas as FabricCanvas, Rect, FabricText } from 'fabric';
import { createFabricVideo, createFabricImage } from '@/lib/fabricVideoElement';
import { ASPECT_RATIO_DIMENSIONS, PRESETS } from '@/components/compose/presets';
import type {
  ComposeConfig, ComposeLayer, ComposeAspectRatio, ComposePresetId,
  ComposeLayerFit, LayerSource,
} from '@/types';
import type { FabricImage, FabricObject } from 'fabric';

function makeLayerId(): string {
  return `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultConfig(): ComposeConfig {
  const dims = ASPECT_RATIO_DIMENSIONS['9:16'];
  return {
    canvasWidth: dims.width,
    canvasHeight: dims.height,
    aspectRatio: '9:16',
    preset: null,
    backgroundColor: '#000000',
    layers: [],
  };
}

/** URLs are now R2 public — return as-is. */
function resolveDisplayUrl(url: string): string {
  return url;
}

/**
 * Position, scale, and clip a FabricImage to fit a target slot.
 *
 * For 'cover': scales uniformly to fill the slot, clips overflow, and adjusts
 * left/top so the visible (clipped) area aligns exactly with the slot rect.
 *
 * For 'contain' / 'stretch': positions at the slot's top-left corner.
 */
function applyFit(
  obj: FabricImage,
  sourceW: number,
  sourceH: number,
  slotLeft: number,
  slotTop: number,
  slotW: number,
  slotH: number,
  fit: ComposeLayerFit,
  borderRadius = 0,
) {
  // borderRadius 0-50 maps to 0%-50% of the shorter slot side (display coords).
  // Convert to a visual radius, then to source-image coordinates for the clipPath.
  const minSlotDim = Math.min(slotW, slotH);
  const visualRadius = (borderRadius / 100) * minSlotDim;

  switch (fit) {
    case 'cover': {
      const scale = Math.max(slotW / sourceW, slotH / sourceH);
      // Offset so that the centered clipPath aligns with the slot rect
      const offsetX = (sourceW * scale - slotW) / 2;
      const offsetY = (sourceH * scale - slotH) / 2;
      obj.set({
        scaleX: scale,
        scaleY: scale,
        left: slotLeft - offsetX,
        top: slotTop - offsetY,
      });
      obj.clipPath = new Rect({
        width: slotW / scale,
        height: slotH / scale,
        rx: visualRadius / scale,
        ry: visualRadius / scale,
        originX: 'center',
        originY: 'center',
      });
      break;
    }
    case 'contain': {
      const scale = Math.min(slotW / sourceW, slotH / sourceH);
      obj.set({ scaleX: scale, scaleY: scale, left: slotLeft, top: slotTop });
      if (borderRadius > 0) {
        obj.clipPath = new Rect({
          width: sourceW,
          height: sourceH,
          rx: visualRadius / scale,
          ry: visualRadius / scale,
          originX: 'center',
          originY: 'center',
        });
      } else {
        obj.clipPath = undefined;
      }
      break;
    }
    case 'stretch':
    default: {
      const sx = slotW / sourceW;
      const sy = slotH / sourceH;
      obj.set({
        scaleX: sx,
        scaleY: sy,
        left: slotLeft,
        top: slotTop,
      });
      if (borderRadius > 0) {
        obj.clipPath = new Rect({
          width: sourceW,
          height: sourceH,
          rx: visualRadius / sx,
          ry: visualRadius / sy,
          originX: 'center',
          originY: 'center',
        });
      } else {
        obj.clipPath = undefined;
      }
      break;
    }
  }
}

/** Reverse-compute slot position from a fabric object (handles cover offset). */
function extractSlotFromObj(obj: FabricObject, cw: number, ch: number) {
  const clip = (obj as FabricImage).clipPath;
  if (clip && clip.width && clip.height) {
    // Cover mode — the slot dimensions come from the clipPath
    const slotW = clip.width * (obj.scaleX ?? 1);
    const slotH = clip.height * (obj.scaleY ?? 1);
    const offsetX = ((obj.width ?? 0) * (obj.scaleX ?? 1) - slotW) / 2;
    const offsetY = ((obj.height ?? 0) * (obj.scaleY ?? 1) - slotH) / 2;
    return {
      x: ((obj.left ?? 0) + offsetX) / cw,
      y: ((obj.top ?? 0) + offsetY) / ch,
      width: slotW / cw,
      height: slotH / ch,
    };
  }
  // Contain / stretch — direct mapping
  return {
    x: (obj.left ?? 0) / cw,
    y: (obj.top ?? 0) / ch,
    width: ((obj.width ?? 0) * (obj.scaleX ?? 1)) / cw,
    height: ((obj.height ?? 0) * (obj.scaleY ?? 1)) / ch,
  };
}

export function useComposeCanvas(initialConfig?: ComposeConfig) {
  const [config, setConfig] = useState<ComposeConfig>(initialConfig ?? defaultConfig());
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDurations, setVideoDurations] = useState<Map<string, number>>(new Map());
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(new Set());
  const [pendingSlotIndex, setPendingSlotIndex] = useState<number | null>(null);
  const pendingSlotIndexRef = useRef<number | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const fabricObjectsRef = useRef<Map<string, FabricImage>>(new Map());
  const rafRef = useRef<number>(0);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const displayScaleRef = useRef(1);
  const configRef = useRef(config);
  configRef.current = config;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const hiddenLayerIdsRef = useRef(hiddenLayerIds);
  hiddenLayerIdsRef.current = hiddenLayerIds;

  const updatePendingSlotIndex = useCallback((idx: number | null) => {
    pendingSlotIndexRef.current = idx;
    setPendingSlotIndex(idx);
  }, []);

  const initCanvas = useCallback((canvasEl: HTMLCanvasElement, containerWidth: number) => {
    canvasElRef.current = canvasEl;
    if (fabricRef.current) {
      fabricRef.current.dispose();
    }
    const cfg = configRef.current;
    const scale = containerWidth / cfg.canvasWidth;
    displayScaleRef.current = scale;

    const canvas = new FabricCanvas(canvasEl, {
      width: cfg.canvasWidth * scale,
      height: cfg.canvasHeight * scale,
      backgroundColor: cfg.backgroundColor,
      selection: true,
    });

    canvas.on('object:modified', (e) => {
      const obj = e.target;
      if (!obj) return;
      const layerId = (obj as FabricImage & { layerId?: string }).layerId;
      if (!layerId) return;
      const s = displayScaleRef.current;
      const c = configRef.current;
      const cw = c.canvasWidth * s;
      const ch = c.canvasHeight * s;
      const slot = extractSlotFromObj(obj, cw, ch);
      setConfig((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, ...slot } : l,
        ),
      }));
    });

    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        const layerId = (obj as FabricImage & { layerId?: string }).layerId;
        if (layerId) setSelectedLayerId(layerId);
      }
    });

    canvas.on('selection:updated', (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        const layerId = (obj as FabricImage & { layerId?: string }).layerId;
        if (layerId) setSelectedLayerId(layerId);
      }
    });

    canvas.on('selection:cleared', () => {
      setSelectedLayerId(null);
    });

    fabricRef.current = canvas;

    // Re-add existing layers to the new canvas (survives dispose/re-init)
    const currentCfg = configRef.current;
    const cw = currentCfg.canvasWidth * scale;
    const ch = currentCfg.canvasHeight * scale;
    currentCfg.layers.forEach((layer) => {
      const obj = fabricObjectsRef.current.get(layer.id);
      if (obj) {
        const label = (obj as FabricObject & { _placeholderLabel?: FabricObject })._placeholderLabel;
        if (label) canvas.add(label);
        canvas.add(obj);
        const sourceW = obj.width || 100;
        const sourceH = obj.height || 100;
        applyFit(obj as FabricImage, sourceW, sourceH, layer.x * cw, layer.y * ch, layer.width * cw, layer.height * ch, layer.fit, layer.borderRadius ?? 0);
      }
    });
    canvas.renderAll();

    // Recreate fabric objects for config layers that have no fabric object yet
    // (happens when the component remounts with a saved / updated config).
    currentCfg.layers.forEach(async (layer) => {
      if (fabricObjectsRef.current.has(layer.id)) return;
      const displayUrl = layer.source.url ? resolveDisplayUrl(layer.source.url) : '';
      if (!displayUrl) return;
      try {
        const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(displayUrl);
        if (layer.type === 'video' && !isImageUrl) {
          const { fabricObj, videoEl } = await createFabricVideo(displayUrl, {
            left: layer.x * cw, top: layer.y * ch, scaleX: 1, scaleY: 1,
          });
          applyFit(fabricObj, videoEl.videoWidth || 640, videoEl.videoHeight || 360,
            layer.x * cw, layer.y * ch, layer.width * cw, layer.height * ch, layer.fit, layer.borderRadius ?? 0);
          (fabricObj as FabricObject & { layerId?: string }).layerId = layer.id;
          fabricObj.set({ opacity: layer.opacity ?? 1 });
          fabricObjectsRef.current.set(layer.id, fabricObj);
          videoElementsRef.current.set(layer.id, videoEl);
          if (layer.audioDetached) videoEl.muted = true;
          canvas.add(fabricObj);
          if (videoEl.duration && isFinite(videoEl.duration)) {
            setVideoDurations((prev) => new Map(prev).set(layer.id, videoEl.duration));
          } else {
            videoEl.addEventListener('loadedmetadata', () => {
              if (isFinite(videoEl.duration))
                setVideoDurations((prev) => new Map(prev).set(layer.id, videoEl.duration));
            }, { once: true });
          }
        } else {
          const imgObj = await createFabricImage(displayUrl, {
            left: layer.x * cw, top: layer.y * ch, scaleX: 1, scaleY: 1,
          });
          applyFit(imgObj, imgObj.width || 100, imgObj.height || 100,
            layer.x * cw, layer.y * ch, layer.width * cw, layer.height * ch, layer.fit, layer.borderRadius ?? 0);
          (imgObj as FabricObject & { layerId?: string }).layerId = layer.id;
          imgObj.set({ opacity: layer.opacity ?? 1 });
          fabricObjectsRef.current.set(layer.id, imgObj);
          canvas.add(imgObj);
        }
        canvas.renderAll();
      } catch (err) {
        console.warn('Failed to restore layer:', layer.id, err);
      }
    });

    return canvas;
  }, []);

  useEffect(() => {
    const render = () => {
      if (fabricRef.current) {
        const cfg = configRef.current;
        const hidden = hiddenLayerIdsRef.current;

        videoElementsRef.current.forEach((videoEl, layerId) => {
          const obj = fabricObjectsRef.current.get(layerId);
          if (!obj) return;
          (obj as FabricImage & { dirty?: boolean }).dirty = true;

          const manuallyHidden = hidden.has(layerId);
          obj.set({ visible: !manuallyHidden });

          // Pause video when it reaches trim end (while playing)
          if (isPlayingRef.current) {
            const layer = cfg.layers.find((l) => l.id === layerId);
            if (layer) {
              const trimEnd = layer.trim?.endSec ?? (videoEl.duration || 60);
              if (videoEl.currentTime >= trimEnd) {
                videoEl.pause();
              }
            }
          }
        });

        fabricObjectsRef.current.forEach((obj, layerId) => {
          if (videoElementsRef.current.has(layerId)) return; // already handled above
          const manuallyHidden = hidden.has(layerId);
          obj.set({ visible: !manuallyHidden });
        });

        fabricRef.current.renderAll();
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const addLayer = useCallback(async (source: LayerSource, type: 'video' | 'image', slotIndex?: number) => {
    const canvas = fabricRef.current;
    if (!canvas) {
      console.error('Canvas not initialized');
      return;
    }

    const id = makeLayerId();
    const cfg = configRef.current;
    const s = displayScaleRef.current;
    const cw = cfg.canvasWidth * s;
    const ch = cfg.canvasHeight * s;

    // Determine position: snap to preset slot if available, otherwise free placement
    let layerX = 0.25;
    let layerY = 0.25;
    let layerW = 0.5;
    let layerH = 0.5;
    let layerFit: ComposeLayerFit = 'cover';

    const preset = cfg.preset && cfg.preset !== 'free-canvas' ? PRESETS[cfg.preset] : null;
    if (preset) {
      const positions = preset.getPositions();
      // Use explicit slot index, pending slot from click (via ref for fresh value), or find the next empty slot
      const currentPendingSlot = pendingSlotIndexRef.current;
      const targetSlot = slotIndex ?? currentPendingSlot ?? cfg.layers.length;
      // Clear pending slot after use
      if (currentPendingSlot !== null) {
        pendingSlotIndexRef.current = null;
        setPendingSlotIndex(null);
      }
      if (targetSlot < positions.length) {
        const pos = positions[targetSlot];
        layerX = pos.x;
        layerY = pos.y;
        layerW = pos.width;
        layerH = pos.height;
        // Use 'cover' for preset slots so content fills the slot completely
        layerFit = 'cover';
      }
    }

    const layer: ComposeLayer = {
      id,
      type,
      source,
      x: layerX,
      y: layerY,
      width: layerW,
      height: layerH,
      zIndex: cfg.layers.length,
      fit: layerFit,
      opacity: 1,
    };

    const createPlaceholder = (): FabricObject => {
      const pw = layerW * cw;
      const ph = layerH * ch;
      const rect = new Rect({
        left: layerX * cw,
        top: layerY * ch,
        width: pw,
        height: ph,
        fill: '#1a1a2e',
        stroke: '#7c3aed',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        rx: 4,
        ry: 4,
      });
      const label = new FabricText(source.label || 'Pending', {
        fontSize: Math.max(10, pw * 0.08),
        fill: '#a78bfa',
        originX: 'center',
        originY: 'center',
        left: layerX * cw + pw / 2,
        top: layerY * ch + ph / 2,
        selectable: false,
        evented: false,
      });
      // Store label reference but DON'T add to canvas here — the caller handles canvas.add
      (rect as FabricObject & { layerId?: string; _placeholderLabel?: FabricObject }).layerId = id;
      (rect as FabricObject & { layerId?: string; _placeholderLabel?: FabricObject })._placeholderLabel = label;
      return rect;
    };

    try {
      let fabricObj: FabricObject;

      // Resolve display URL
      const displayUrl = source.url ? resolveDisplayUrl(source.url) : '';

      // Detect if URL looks like an image (known image extensions)
      const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(displayUrl);

      if (!displayUrl) {
        fabricObj = createPlaceholder();
      } else if (type === 'video') {
        // For video layers: if URL is clearly an image, load as image preview.
        // Otherwise, try loading as video first, then fall back to image.
        if (isImageUrl) {
          // Known image URL — show as static preview
          try {
            const imgObj = await createFabricImage(displayUrl, {
              left: layerX * cw,
              top: layerY * ch,
              scaleX: 1,
              scaleY: 1,
            });
            const ow = imgObj.width || 100;
            const oh = imgObj.height || 100;
            applyFit(imgObj, ow, oh, layerX * cw, layerY * ch, layerW * cw, layerH * ch, layerFit);
            fabricObj = imgObj;
          } catch {
            fabricObj = createPlaceholder();
          }
        } else {
          // Try loading as actual video (R2/GCS URLs often have no extension)
          try {
            const { fabricObj: obj, videoEl } = await createFabricVideo(displayUrl, {
              left: layerX * cw,
              top: layerY * ch,
              scaleX: 1,
              scaleY: 1,
            });
            const vw = videoEl.videoWidth || 640;
            const vh = videoEl.videoHeight || 360;
            applyFit(obj, vw, vh, layerX * cw, layerY * ch, layerW * cw, layerH * ch, layerFit);
            fabricObj = obj;
            videoElementsRef.current.set(id, videoEl);
            // Track video duration once metadata is loaded
            if (videoEl.duration && isFinite(videoEl.duration)) {
              setVideoDurations((prev) => new Map(prev).set(id, videoEl.duration));
            } else {
              videoEl.addEventListener('loadedmetadata', () => {
                if (isFinite(videoEl.duration)) {
                  setVideoDurations((prev) => new Map(prev).set(id, videoEl.duration));
                }
              }, { once: true });
            }
            if (isPlayingRef.current) videoEl.play().catch((err) => console.warn('Auto-play failed:', err));
          } catch {
            // Video load failed — fall back to image
            try {
              const imgObj = await createFabricImage(displayUrl, {
                left: layerX * cw,
                top: layerY * ch,
                scaleX: 1,
                scaleY: 1,
              });
              const ow = imgObj.width || 100;
              const oh = imgObj.height || 100;
              applyFit(imgObj, ow, oh, layerX * cw, layerY * ch, layerW * cw, layerH * ch, layerFit);
              fabricObj = imgObj;
            } catch {
              fabricObj = createPlaceholder();
            }
          }
        }
      } else {
        // Image type
        try {
          const imgObj = await createFabricImage(displayUrl, {
            left: layerX * cw,
            top: layerY * ch,
            scaleX: 1,
            scaleY: 1,
          });
          const ow = imgObj.width || 100;
          const oh = imgObj.height || 100;
          applyFit(imgObj, ow, oh, layerX * cw, layerY * ch, layerW * cw, layerH * ch, layerFit);
          fabricObj = imgObj;
        } catch {
          fabricObj = createPlaceholder();
        }
      }

      (fabricObj as FabricObject & { layerId?: string }).layerId = id;
      fabricObj.set({ opacity: layer.opacity ?? 1 });
      fabricObjectsRef.current.set(id, fabricObj as FabricImage);

      // Add to canvas — placeholder label first if present, then the object itself
      const placeholderLabel = (fabricObj as FabricObject & { _placeholderLabel?: FabricObject })._placeholderLabel;
      if (placeholderLabel) canvas.add(placeholderLabel);
      canvas.add(fabricObj);

      try {
        canvas.setActiveObject(fabricObj);
      } catch {
        // setActiveObject may fail in some edge cases — not critical
      }
      canvas.renderAll();

      // Always save the layer to config
      setConfig((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
      setSelectedLayerId(id);
    } catch (err) {
      console.error('Failed to add layer:', err);
    }
  }, []);

  const removeLayer = useCallback((id: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const obj = fabricObjectsRef.current.get(id);
    if (obj) {
      const label = (obj as FabricObject & { _placeholderLabel?: FabricObject })._placeholderLabel;
      if (label) canvas.remove(label);
      canvas.remove(obj);
      fabricObjectsRef.current.delete(id);
    }

    const videoEl = videoElementsRef.current.get(id);
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
      videoElementsRef.current.delete(id);
    }

    setVideoDurations((prev) => { const next = new Map(prev); next.delete(id); return next; });
    setHiddenLayerIds((prev) => { const next = new Set(prev); next.delete(id); return next; });

    setConfig((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== id),
    }));

    setSelectedLayerId((prev) => (prev === id ? null : prev));
    canvas.renderAll();
  }, []);

  const updateLayer = useCallback((id: string, updates: Partial<ComposeLayer>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const cfg = configRef.current;
    const s = displayScaleRef.current;
    const cw = cfg.canvasWidth * s;
    const ch = cfg.canvasHeight * s;

    const currentLayer = cfg.layers.find((l) => l.id === id);
    if (!currentLayer) return;

    setConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));

    const obj = fabricObjectsRef.current.get(id);
    if (!obj) return;

    if (updates.opacity !== undefined) obj.set({ opacity: updates.opacity });

    const needsRefit = updates.x !== undefined || updates.y !== undefined
      || updates.width !== undefined || updates.height !== undefined
      || updates.fit !== undefined || updates.borderRadius !== undefined;
    if (needsRefit) {
      const sourceW = obj.width || 100;
      const sourceH = obj.height || 100;
      const slotLeft = (updates.x ?? currentLayer.x) * cw;
      const slotTop = (updates.y ?? currentLayer.y) * ch;
      const slotW = (updates.width ?? currentLayer.width) * cw;
      const slotH = (updates.height ?? currentLayer.height) * ch;
      const fit = updates.fit ?? currentLayer.fit;
      const br = updates.borderRadius ?? currentLayer.borderRadius ?? 0;
      applyFit(obj, sourceW, sourceH, slotLeft, slotTop, slotW, slotH, fit, br);
    }

    canvas.renderAll();
  }, []);

  const applyPreset = useCallback((presetId: ComposePresetId) => {
    const preset = PRESETS[presetId];
    if (!preset) return;

    const canvas = fabricRef.current;
    if (!canvas) return;

    const positions = preset.getPositions();
    const cfg = configRef.current;
    const s = displayScaleRef.current;
    const cw = cfg.canvasWidth * s;
    const ch = cfg.canvasHeight * s;

    const isFreeCanvas = presetId === 'free-canvas';
    const fitMode: ComposeLayerFit = 'cover';

    setConfig((prev) => {
      const newLayers = prev.layers.map((layer, i) => {
        if (i >= positions.length) return layer;
        const pos = positions[i];
        return { ...layer, x: pos.x, y: pos.y, width: pos.width, height: pos.height, fit: fitMode };
      });
      return { ...prev, preset: presetId, layers: newLayers };
    });

    cfg.layers.forEach((layer, i) => {
      if (i >= positions.length) return;
      const pos = positions[i];
      const obj = fabricObjectsRef.current.get(layer.id);
      if (!obj) return;

      const sourceW = obj.width || 100;
      const sourceH = obj.height || 100;
      applyFit(obj, sourceW, sourceH, pos.x * cw, pos.y * ch, pos.width * cw, pos.height * ch, fitMode, layer.borderRadius ?? 0);
    });

    canvas.renderAll();
  }, []);

  const setAspectRatio = useCallback((ratio: ComposeAspectRatio) => {
    const dims = ASPECT_RATIO_DIMENSIONS[ratio];
    setConfig((prev) => ({
      ...prev,
      aspectRatio: ratio,
      canvasWidth: dims.width,
      canvasHeight: dims.height,
    }));
  }, []);

  const setBackgroundColor = useCallback((color: string) => {
    setConfig((prev) => ({ ...prev, backgroundColor: color }));
    if (fabricRef.current) {
      fabricRef.current.backgroundColor = color;
      fabricRef.current.renderAll();
    }
  }, []);

  const reorderLayers = useCallback((fromIdx: number, toIdx: number) => {
    setConfig((prev) => {
      const newLayers = [...prev.layers];
      const [moved] = newLayers.splice(fromIdx, 1);
      newLayers.splice(toIdx, 0, moved);
      return {
        ...prev,
        layers: newLayers.map((l, i) => ({ ...l, zIndex: i })),
      };
    });

    const canvas = fabricRef.current;
    if (!canvas) return;
    const cfg = configRef.current;
    const objects = canvas.getObjects();
    cfg.layers.forEach((layer) => {
      const obj = fabricObjectsRef.current.get(layer.id);
      if (obj && objects.includes(obj)) {
        canvas.remove(obj);
      }
    });
    const newLayers = [...cfg.layers];
    const [moved] = newLayers.splice(fromIdx, 1);
    newLayers.splice(toIdx, 0, moved);
    newLayers.forEach((layer) => {
      const obj = fabricObjectsRef.current.get(layer.id);
      if (obj) canvas.add(obj);
    });
    canvas.renderAll();
  }, []);

  const playAll = useCallback(() => {
    const cfg = configRef.current;
    videoElementsRef.current.forEach((v, layerId) => {
      const layer = cfg.layers.find((l) => l.id === layerId);
      const trimStart = layer?.trim?.startSec ?? 0;
      const trimEnd = layer?.trim?.endSec ?? (v.duration || 60);
      // If video is at or past trim end, seek back to trim start
      if (v.currentTime >= trimEnd || v.ended) {
        v.currentTime = trimStart;
      }
      // Make the fabric object visible again
      const obj = fabricObjectsRef.current.get(layerId);
      if (obj && !hiddenLayerIdsRef.current.has(layerId)) {
        obj.set({ visible: true });
      }
      v.play().catch((err) => console.warn(`Play failed for layer ${layerId}:`, err));
    });
    setIsPlaying(true);
  }, []);

  const pauseAll = useCallback(() => {
    videoElementsRef.current.forEach((v, layerId) => {
      v.pause();
      // Restore visibility when paused (so user can see all layers)
      const obj = fabricObjectsRef.current.get(layerId);
      if (obj && !hiddenLayerIdsRef.current.has(layerId)) {
        obj.set({ visible: true });
      }
    });
    fabricRef.current?.renderAll();
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback((layerId: string, timeSec: number) => {
    const videoEl = videoElementsRef.current.get(layerId);
    if (videoEl) {
      videoEl.currentTime = timeSec;
      fabricRef.current?.renderAll();
    }
  }, []);

  const seekGlobal = useCallback((timeSec: number) => {
    videoElementsRef.current.forEach((videoEl) => {
      videoEl.currentTime = timeSec;
    });
    fabricRef.current?.renderAll();
  }, []);

  const getVideoElements = useCallback(() => {
    return videoElementsRef.current;
  }, []);

  const duplicateLayer = useCallback(async (layerId: string) => {
    const cfg = configRef.current;
    const layer = cfg.layers.find((l) => l.id === layerId);
    if (!layer) return;
    // Add a new layer with the same source, then apply position/size offsets
    await addLayer(layer.source, layer.type);
    // The new layer was added at the end — update it with the original's config + slight offset
    setConfig((prev) => {
      const newLayers = [...prev.layers];
      const newLayer = newLayers[newLayers.length - 1];
      if (newLayer) {
        const offset = 0.02; // slight offset so it's visible
        newLayer.x = Math.min(1, layer.x + offset);
        newLayer.y = Math.min(1, layer.y + offset);
        newLayer.width = layer.width;
        newLayer.height = layer.height;
        newLayer.fit = layer.fit;
        newLayer.opacity = layer.opacity;
        newLayer.borderRadius = layer.borderRadius;
        newLayer.trim = layer.trim ? { ...layer.trim } : undefined;
        newLayer.audioDetached = layer.audioDetached;
      }
      return { ...prev, layers: newLayers };
    });
  }, [addLayer]);

  const toggleAudioDetach = useCallback((layerId: string) => {
    const videoEl = videoElementsRef.current.get(layerId);
    setConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => {
        if (l.id !== layerId) return l;
        const detached = !l.audioDetached;
        if (videoEl) videoEl.muted = detached;
        return { ...l, audioDetached: detached };
      }),
    }));
  }, []);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = fabricObjectsRef.current.get(layerId);
    if (!obj) return;

    setHiddenLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
        obj.set({ visible: true });
      } else {
        next.add(layerId);
        obj.set({ visible: false });
      }
      canvas.renderAll();
      return next;
    });
  }, []);

  const selectLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!id) {
      canvas.discardActiveObject();
      canvas.renderAll();
      return;
    }
    const obj = fabricObjectsRef.current.get(id);
    if (obj) {
      canvas.setActiveObject(obj);
      canvas.renderAll();
    }
  }, []);

  const nudgeLayer = useCallback((id: string, dx: number, dy: number) => {
    const currentLayer = configRef.current.layers.find((l) => l.id === id);
    if (!currentLayer) return;
    const newX = Math.max(0, Math.min(1, currentLayer.x + dx));
    const newY = Math.max(0, Math.min(1, currentLayer.y + dy));
    updateLayer(id, { x: newX, y: newY });
  }, [updateLayer]);

  const deselectAll = useCallback(() => {
    setSelectedLayerId(null);
    const canvas = fabricRef.current;
    if (canvas) {
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  }, []);

  const resizeCanvas = useCallback((containerWidth: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const cfg = configRef.current;
    const scale = containerWidth / cfg.canvasWidth;
    displayScaleRef.current = scale;

    canvas.setDimensions({
      width: cfg.canvasWidth * scale,
      height: cfg.canvasHeight * scale,
    });

    cfg.layers.forEach((layer) => {
      const obj = fabricObjectsRef.current.get(layer.id);
      if (!obj) return;
      const cw = cfg.canvasWidth * scale;
      const ch = cfg.canvasHeight * scale;
      const sourceW = obj.width || 100;
      const sourceH = obj.height || 100;
      applyFit(obj, sourceW, sourceH, layer.x * cw, layer.y * ch, layer.width * cw, layer.height * ch, layer.fit, layer.borderRadius ?? 0);
    });

    canvas.renderAll();
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      videoElementsRef.current.forEach((v) => {
        v.pause();
        v.src = '';
      });
      videoElementsRef.current.clear();
      fabricObjectsRef.current.clear();
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, []);

  return {
    config,
    setConfig,
    selectedLayerId,
    setSelectedLayerId: selectLayer,
    isPlaying,
    videoDurations,
    hiddenLayerIds,
    pendingSlotIndex,
    setPendingSlotIndex: updatePendingSlotIndex,
    initCanvas,
    addLayer,
    removeLayer,
    updateLayer,
    nudgeLayer,
    deselectAll,
    applyPreset,
    setAspectRatio,
    setBackgroundColor,
    reorderLayers,
    playAll,
    pauseAll,
    seekTo,
    seekGlobal,
    getVideoElements,
    toggleLayerVisibility,
    toggleAudioDetach,
    duplicateLayer,
    resizeCanvas,
  };
}
