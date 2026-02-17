'use client';
import { useState, useRef, useCallback, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Plus, Video, Subtitles, Music, Film, Upload, Play,
  ChevronRight, Eye, EyeOff, Trash2, ZoomIn, ZoomOut, Maximize2, Layers, LayoutGrid,
} from 'lucide-react';
import type {
  MiniAppStep, MiniAppType,
  VideoGenConfig, TextOverlayConfig, BgMusicConfig, AttachVideoConfig, BatchVideoGenConfig, ComposeConfig,
} from '@/types';
import MiniAppPicker from './MiniAppPicker';
import Modal from '@/components/ui/Modal';
const CARD_W = 300;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const nodeMeta: Record<MiniAppType, {
  label: string;
  icon: typeof Video;
  iconBg: string;
  iconColor: string;
}> = {
  'video-generation': { label: 'Video Generation', icon: Video,  iconBg: 'var(--accent)',                iconColor: 'var(--primary)' },
  'text-overlay':     { label: 'Text Overlay',     icon: Subtitles, iconBg: 'var(--accent)',                iconColor: 'var(--primary)' },
  'bg-music':         { label: 'Background Music', icon: Music,  iconBg: 'rgba(212, 105, 142, 0.10)',    iconColor: 'var(--primary)' },
  'attach-video':     { label: 'Attach Video',     icon: Film,   iconBg: 'rgba(232, 114, 154, 0.10)',    iconColor: '#e8729a' },
  'batch-video-generation': { label: 'Batch Video Gen', icon: Layers, iconBg: 'rgba(217, 119, 6, 0.10)', iconColor: '#d97706' },
  'compose': { label: 'Compose', icon: LayoutGrid, iconBg: 'rgba(22, 163, 106, 0.10)', iconColor: '#16a34a' },
};
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function getStepSummary(step: MiniAppStep): string {
  if (!step.enabled) return 'Disabled';
  switch (step.type) {
    case 'video-generation': {
      const c = step.config as VideoGenConfig;
      return c.mode === 'motion-control' ? 'Motion Control' : 'Subtle Animation';
    }
    case 'text-overlay': {
      const c = step.config as TextOverlayConfig;
      if (!c.text) return 'Configure text\u2026';
      return `\u201c${c.text.slice(0, 22)}${c.text.length > 22 ? '\u2026' : ''}\u201d`;
    }
    case 'bg-music': {
      const c = step.config as BgMusicConfig;
      const count = c.applyToSteps?.length ?? 0;
      const target = count === 0 ? 'All steps' : `${count} step${count > 1 ? 's' : ''}`;
      return `${target} \u00b7 ${c.volume}%${c.trackId ? '' : ' \u00b7 No track'}`;
    }
    case 'attach-video': {
      const c = step.config as AttachVideoConfig;
      const pos = c.position === 'before' ? 'Prepend' : 'Append';
      if (c.sourceStepId) return `${pos} \u00b7 Pipeline`;
      if (c.tiktokUrl) return `${pos} \u00b7 TikTok`;
      if (c.videoUrl) return `${pos} \u00b7 Uploaded`;
      return `${pos} clip`;
    }
    case 'batch-video-generation': {
      const c = step.config as BatchVideoGenConfig;
      const modeLabel = c.mode === 'motion-control' ? 'Motion' : 'Subtle';
      return `${c.images.length} image${c.images.length !== 1 ? 's' : ''} \u00b7 ${modeLabel}`;
    }
    case 'compose': {
      const c = step.config as ComposeConfig;
      const presetLabel = c.preset ? c.preset.replace(/-/g, ' ') : 'Custom';
      return `${c.layers.length} layer${c.layers.length !== 1 ? 's' : ''} \u00b7 ${presetLabel}`;
    }
    default: return '';
  }
}
function isStepConfigured(step: MiniAppStep): boolean {
  switch (step.type) {
    case 'text-overlay':     return !!(step.config as TextOverlayConfig).text;
    case 'bg-music':         return !!(step.config as BgMusicConfig).trackId || !!(step.config as BgMusicConfig).customTrackUrl;
    case 'attach-video':     return !!(step.config as AttachVideoConfig).videoUrl || !!(step.config as AttachVideoConfig).sourceStepId || !!(step.config as AttachVideoConfig).tiktokUrl;
    case 'video-generation': return !!(step.config as VideoGenConfig).imageId || !!(step.config as VideoGenConfig).imageUrl;
    case 'batch-video-generation': return (step.config as BatchVideoGenConfig).images.length > 0;
    case 'compose':              return (step.config as ComposeConfig).layers.length > 0;
    default: return false;
  }
}
function FlowConnector({ filled }: { filled: boolean }) {
  return (
    <div className="flex justify-center py-0.5">
      <svg width="12" height="32" viewBox="0 0 12 32" fill="none">
        <path
          d="M6 0V24"
          stroke={filled ? '#22c55e' : 'var(--border)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={filled ? '4 3' : 'none'}
          className={filled ? 'animate-dash' : undefined}
        />
        <path
          d="M2.5 22 L6 30 L9.5 22"
          fill={filled ? '#22c55e' : 'var(--border)'}
        />
      </svg>
    </div>
  );
}
function SortableFlowNode({
  step, index, isSelected, onSelect, onToggle, onRemove, steps, validationError,
}: {
  step: MiniAppStep; index: number; isSelected: boolean;
  onSelect: () => void; onToggle: () => void; onRemove: () => void;
  steps: MiniAppStep[]; validationError?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    width: CARD_W,
  };
  const meta = nodeMeta[step.type];
  const Icon = meta.icon;
  const summary = getStepSummary(step);
  const configured = isStepConfigured(step);
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Card */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className={`group relative cursor-pointer rounded-2xl border bg-[var(--surface)] backdrop-blur-xl transition-all duration-150 ${
          isDragging ? 'scale-[1.02] shadow-xl' : ''
        } ${validationError
          ? 'ring-2 ring-red-500 border-red-300 shadow-md shadow-red-100'
          : isSelected
            ? 'ring-1 ring-[var(--primary)] border-black/[0.08] shadow-md'
            : 'border-black/[0.08] shadow hover:shadow-md'
        } ${!step.enabled ? 'opacity-40' : ''}`}
      >
        {/* Animated green dashed border when configured */}
        {configured && step.enabled && (
          <svg className="absolute inset-[-1px] pointer-events-none" style={{ width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', overflow: 'visible' }}>
            <rect x="0.75" y="0.75" rx="16" ry="16" width="calc(100% - 1.5px)" height="calc(100% - 1.5px)" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6 4" className="animate-dash" />
          </svg>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab touch-none text-[var(--border)] opacity-0 transition-opacity group-hover:opacity-100"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {/* Icon */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: meta.iconBg }}
          >
            <Icon className="h-4 w-4" style={{ color: meta.iconColor }} />
          </div>
          {/* Text */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--text)]">{meta.label}</span>
              <span className="text-[11px] text-[var(--text-muted)]">#{index + 1}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              {validationError
                ? <span className="truncate text-[11px] font-medium text-red-500">{validationError}</span>
                : <span className="truncate text-[11px] text-[var(--text-muted)]">{summary}</span>
              }
              {step.type === 'attach-video' && (step.config as AttachVideoConfig).sourceStepId && (() => {
                const refIdx = steps.findIndex((s) => s.id === (step.config as AttachVideoConfig).sourceStepId);
                if (refIdx === -1) return null;
                return (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                    ← from #{refIdx + 1}
                  </span>
                );
              })()}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border)]" />
        </div>
      </div>
      {/* Side actions: absolute so they don't affect card centering */}
      <div className="absolute right-0 top-2 translate-x-[calc(100%+8px)] flex flex-col items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`rounded-lg p-1.5 transition-colors ${
            step.enabled
              ? 'text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              : 'text-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--text-muted)]'
          }`}
        >
          {step.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <FlowConnector filled={configured && step.enabled} />
    </div>
  );
}
function ZoomControls({
  zoom, onZoomIn, onZoomOut, onFitView,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl bg-[var(--surface)] px-2 py-1.5 shadow-lg backdrop-blur-xl border border-[var(--border)]">
      <button
        onClick={onZoomOut}
        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--accent)]"
      >
        <ZoomOut className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      </button>
      <span className="min-w-[3rem] text-center text-[11px] font-medium text-[var(--text-muted)]">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--accent)]"
      >
        <ZoomIn className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      </button>
      <div className="mx-1 h-4 w-px bg-[var(--border)]" />
      <button
        onClick={onFitView}
        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--accent)]"
        title="Fit view"
      >
        <Maximize2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      </button>
    </div>
  );
}
export default function PipelineBuilder({
  steps, onChange, selectedId, onSelect,
  videoSource, tiktokUrl, videoUrl, validationErrors,
}: {
  steps: MiniAppStep[];
  onChange: (steps: MiniAppStep[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  videoSource: 'tiktok' | 'upload';
  tiktokUrl: string;
  videoUrl: string;
  validationErrors?: Map<string, string>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const hasMounted = useRef(false);
  const fitView = useCallback(() => {
    if (!canvasRef.current || !contentRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    const content = contentRef.current;
    const cw = content.scrollWidth;
    const ch = content.scrollHeight;
    const padding = 40;
    const scaleX = (canvas.width - padding * 2) / cw;
    const scaleY = (canvas.height - padding * 2) / ch;
    const newZoom = clamp(Math.min(scaleX, scaleY, 1), MIN_ZOOM, MAX_ZOOM);
    const newPanX = (canvas.width - cw * newZoom) / 2;
    const newPanY = (canvas.height - ch * newZoom) / 2;
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, []);
  useEffect(() => {
    if (!hasMounted.current) {
      const t = setTimeout(fitView, 50);
      hasMounted.current = true;
      return () => clearTimeout(t);
    }
  }, [fitView]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange(arrayMove(steps, steps.findIndex((s) => s.id === active.id), steps.findIndex((s) => s.id === over.id)));
  };
  const handleCanvasMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { x: pan.x, y: pan.y };
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  }, [pan]);
  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isPanning.current) return;
      setPan({
        x: panOrigin.current.x + (e.clientX - panStart.current.x),
        y: panOrigin.current.y + (e.clientY - panStart.current.y),
      });
    };
    const handleMouseUp = () => {
      isPanning.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const raw = -e.deltaY * 0.0003;
      const delta = clamp(raw, -0.02, 0.02);
      setZoom((prevZoom) => {
        const newZoom = clamp(prevZoom + delta, MIN_ZOOM, MAX_ZOOM);
        const ratio = newZoom / prevZoom;
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setPan((prevPan) => ({
          x: cx - (cx - prevPan.x) * ratio,
          y: cy - (cy - prevPan.y) * ratio,
        }));
        return newZoom;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const handleAdd = (step: MiniAppStep) => {
    onChange([...steps, step]);
    setShowPicker(false);
    onSelect(step.id);
  };
  const handleToggle = (id: string) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };
  const handleRemove = (id: string) => {
    onChange(steps.filter((s) => s.id !== id));
    if (selectedId === id) onSelect(null);
  };
  const handleZoomIn = () => setZoom((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
  const handleZoomOut = () => setZoom((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
  const sourceHasValue = videoSource === 'tiktok' ? !!tiktokUrl : !!videoUrl;
  const sourceSummary = videoSource === 'tiktok'
    ? (tiktokUrl ? tiktokUrl.slice(0, 28) + '\u2026' : 'Configure TikTok URL\u2026')
    : (videoUrl ? 'Video uploaded' : 'Upload a video\u2026');
  const enabledCount = steps.filter((s) => s.enabled).length;
  const dotSize = 20 * zoom;
  return (
    <div className="relative h-full w-full">
      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        data-canvas="true"
        className="absolute inset-0 overflow-hidden"
        style={{
          cursor: 'grab',
          backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
          backgroundSize: `${dotSize}px ${dotSize}px`,
          backgroundPosition: `${pan.x % dotSize}px ${pan.y % dotSize}px`,
        }}
      >
        {/* Transform layer */}
        <div
          data-canvas="true"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Vertical flow */}
          <div ref={contentRef} className="flex flex-col items-center py-10" data-canvas="true">
            {/* ── Source Node ── */}
            <div
              onClick={() => onSelect('source')}
              className={`relative cursor-pointer rounded-2xl border border-black/[0.08] bg-[var(--surface)] backdrop-blur-xl transition-all duration-150 ${
                selectedId === 'source'
                  ? 'ring-1 ring-[var(--primary)] shadow-md'
                  : 'shadow hover:shadow-md'
              }`}
              style={{ width: CARD_W }}
            >
              {/* Animated green dashed border when filled */}
              {sourceHasValue && (
                <svg className="absolute inset-[-1px] pointer-events-none" style={{ width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', overflow: 'visible' }}>
                  <rect x="0.75" y="0.75" rx="16" ry="16" width="calc(100% - 1.5px)" height="calc(100% - 1.5px)" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6 4" className="animate-dash" />
                </svg>
              )}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
                  <Upload className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--text)]">Video Source</span>
                    <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
                      {videoSource}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{sourceSummary}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border)]" />
              </div>
            </div>
            <FlowConnector filled={sourceHasValue} />
            {/* ── Pipeline Steps ── */}
            {steps.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {steps.map((step, i) => (
                    <SortableFlowNode
                      key={step.id}
                      step={step}
                      index={i}
                      isSelected={selectedId === step.id}
                      onSelect={() => onSelect(step.id)}
                      onToggle={() => handleToggle(step.id)}
                      onRemove={() => handleRemove(step.id)}
                      steps={steps}
                      validationError={validationErrors?.get(step.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {/* ── Add Step ── */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
              className="group flex items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-[var(--surface)] shadow transition-all duration-150 hover:shadow-md hover:bg-[var(--accent)]"
              style={{ width: CARD_W, height: 44, backdropFilter: 'blur(4px)' }}
            >
              <Plus className="h-4 w-4 text-[var(--text-muted)] transition-colors group-hover:text-[var(--primary)]" />
              <span className="text-sm font-medium text-[var(--text-muted)] transition-colors group-hover:text-[var(--primary)]">Add Step</span>
            </button>
            <FlowConnector filled={false} />
            {/* ── Output Node ── */}
            <div
              className="rounded-2xl border border-black/[0.08] bg-[var(--surface)] backdrop-blur-xl shadow"
              style={{ width: CARD_W }}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.10)' }}>
                  <Play className="h-4 w-4" style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[var(--text)]">Output</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {enabledCount} step{enabledCount !== 1 ? 's' : ''} in pipeline
                  </div>
                </div>
                {enabledCount > 0 && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    Ready
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Zoom controls */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={fitView}
      />
      {/* Picker Modal */}
      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Add Pipeline Step">
        <div className="p-5">
          <MiniAppPicker onAdd={handleAdd} />
        </div>
      </Modal>
    </div>
  );
}
