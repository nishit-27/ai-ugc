'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas as FabricCanvas, Rect, FabricText } from 'fabric';
import { createFabricVideo, createFabricImage } from '@/lib/fabricVideoElement';
import { signUrls } from '@/lib/signedUrlClient';
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

async function resolveDisplayUrl(url: string): Promise<string> {
  if (!url) return url;
  if (url.includes('storage.googleapis.com') && !url.includes('X-Goog-')) {
    try {
      const signed = await signUrls([url]);
      return signed.get(url) || url;
    } catch {
      return url;
    }
  }
  return url;
}

function applyFit(
  obj: FabricImage,
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  fit: ComposeLayerFit,
) {
  switch (fit) {
    case 'cover': {
      const scale = Math.max(targetW / sourceW, targetH / sourceH);
      obj.set({ scaleX: scale, scaleY: scale });
      obj.clipPath = new Rect({
        width: targetW / scale,
        height: targetH / scale,
        originX: 'center',
        originY: 'center',
      });
      break;
    }
    case 'contain': {
      const scale = Math.min(targetW / sourceW, targetH / sourceH);
      obj.set({ scaleX: scale, scaleY: scale });
      obj.clipPath = undefined;
      break;
    }
    case 'stretch':
    default: {
      obj.set({ scaleX: targetW / sourceW, scaleY: targetH / sourceH });
      obj.clipPath = undefined;
      break;
    }
  }
}

export function useComposeCanvas(initialConfig?: ComposeConfig) {
  const [config, setConfig] = useState<ComposeConfig>(initialConfig ?? defaultConfig());
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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
      setConfig((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                x: (obj.left ?? 0) / cw,
                y: (obj.top ?? 0) / ch,
                width: ((obj.width ?? 0) * (obj.scaleX ?? 1)) / cw,
                height: ((obj.height ?? 0) * (obj.scaleY ?? 1)) / ch,
              }
            : l,
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
      if (!obj) return;
      const label = (obj as FabricObject & { _placeholderLabel?: FabricObject })._placeholderLabel;
      if (label) canvas.add(label);
      canvas.add(obj);
      obj.set({ left: layer.x * cw, top: layer.y * ch });
      const sourceW = obj.width || 100;
      const sourceH = obj.height || 100;
      applyFit(obj as FabricImage, sourceW, sourceH, layer.width * cw, layer.height * ch, layer.fit);
    });
    canvas.renderAll();

    return canvas;
  }, []);

  useEffect(() => {
    const render = () => {
      if (fabricRef.current && videoElementsRef.current.size > 0) {
        fabricRef.current.renderAll();
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const addLayer = useCallback(async (source: LayerSource, type: 'video' | 'image') => {
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

    const layerW = 0.5;
    const layerH = 0.5;
    const layerX = 0.25;
    const layerY = 0.25;

    const layer: ComposeLayer = {
      id,
      type,
      source,
      x: layerX,
      y: layerY,
      width: layerW,
      height: layerH,
      zIndex: cfg.layers.length,
      fit: 'cover',
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
      canvas.add(rect);
      canvas.add(label);
      (rect as FabricObject & { layerId?: string; _placeholderLabel?: FabricObject }).layerId = id;
      (rect as FabricObject & { layerId?: string; _placeholderLabel?: FabricObject })._placeholderLabel = label;
      return rect;
    };

    try {
      let fabricObj: FabricObject;

      // Sign GCS URLs before loading into canvas
      const displayUrl = source.url ? await resolveDisplayUrl(source.url) : '';

      // For step-output layers, the URL is typically an image preview of the video to be generated.
      const isStepOutputPreview = source.type === 'step-output' && displayUrl && !/\.(mp4|webm|mov|avi)(\?|$)/i.test(displayUrl);

      if (!displayUrl) {
        fabricObj = createPlaceholder();
      } else if (isStepOutputPreview) {
        try {
          const imgObj = await createFabricImage(displayUrl, {
            left: layerX * cw,
            top: layerY * ch,
            scaleX: 1,
            scaleY: 1,
          });
          const ow = imgObj.width || 100;
          const oh = imgObj.height || 100;
          applyFit(imgObj, ow, oh, layerW * cw, layerH * ch, 'cover');
          fabricObj = imgObj;
        } catch {
          fabricObj = createPlaceholder();
        }
      } else if (type === 'video') {
        try {
          const { fabricObj: obj, videoEl } = await createFabricVideo(displayUrl, {
            left: layerX * cw,
            top: layerY * ch,
            scaleX: 1,
            scaleY: 1,
          });
          const vw = videoEl.videoWidth || 640;
          const vh = videoEl.videoHeight || 360;
          applyFit(obj, vw, vh, layerW * cw, layerH * ch, 'cover');
          fabricObj = obj;
          videoElementsRef.current.set(id, videoEl);
          if (isPlayingRef.current) videoEl.play().catch(() => {});
        } catch {
          try {
            const imgObj = await createFabricImage(displayUrl, {
              left: layerX * cw,
              top: layerY * ch,
              scaleX: 1,
              scaleY: 1,
            });
            const ow = imgObj.width || 100;
            const oh = imgObj.height || 100;
            applyFit(imgObj, ow, oh, layerW * cw, layerH * ch, 'cover');
            fabricObj = imgObj;
          } catch {
            fabricObj = createPlaceholder();
          }
        }
      } else {
        try {
          const imgObj = await createFabricImage(displayUrl, {
            left: layerX * cw,
            top: layerY * ch,
            scaleX: 1,
            scaleY: 1,
          });
          const ow = imgObj.width || 100;
          const oh = imgObj.height || 100;
          applyFit(imgObj, ow, oh, layerW * cw, layerH * ch, 'cover');
          fabricObj = imgObj;
        } catch {
          fabricObj = createPlaceholder();
        }
      }

      (fabricObj as FabricObject & { layerId?: string }).layerId = id;
      fabricObj.set({ opacity: layer.opacity ?? 1 });
      fabricObjectsRef.current.set(id, fabricObj as FabricImage);
      if (source.url) {
        canvas.add(fabricObj);
      }
      canvas.setActiveObject(fabricObj);
      canvas.renderAll();

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

    if (updates.x !== undefined) obj.set({ left: updates.x * cw });
    if (updates.y !== undefined) obj.set({ top: updates.y * ch });
    if (updates.opacity !== undefined) obj.set({ opacity: updates.opacity });

    const needsFitUpdate = updates.width !== undefined || updates.height !== undefined || updates.fit !== undefined;
    if (needsFitUpdate) {
      const sourceW = obj.width || 100;
      const sourceH = obj.height || 100;
      const targetW = (updates.width ?? currentLayer.width) * cw;
      const targetH = (updates.height ?? currentLayer.height) * ch;
      const fit = updates.fit ?? currentLayer.fit;
      applyFit(obj, sourceW, sourceH, targetW, targetH, fit);
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

    setConfig((prev) => {
      const newLayers = prev.layers.map((layer, i) => {
        if (i >= positions.length) return layer;
        const pos = positions[i];
        return { ...layer, x: pos.x, y: pos.y, width: pos.width, height: pos.height };
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
      obj.set({ left: pos.x * cw, top: pos.y * ch });
      applyFit(obj, sourceW, sourceH, pos.width * cw, pos.height * ch, layer.fit);
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
    videoElementsRef.current.forEach((v) => v.play().catch(() => {}));
    setIsPlaying(true);
  }, []);

  const pauseAll = useCallback(() => {
    videoElementsRef.current.forEach((v) => v.pause());
    setIsPlaying(false);
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
      obj.set({ left: layer.x * cw, top: layer.y * ch });
      applyFit(obj, sourceW, sourceH, layer.width * cw, layer.height * ch, layer.fit);
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
    initCanvas,
    addLayer,
    removeLayer,
    updateLayer,
    applyPreset,
    setAspectRatio,
    setBackgroundColor,
    reorderLayers,
    playAll,
    pauseAll,
    resizeCanvas,
  };
}
