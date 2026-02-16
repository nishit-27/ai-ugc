'use client';

import { useRef, useCallback, useState } from 'react';
import { ChevronDown, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { TextOverlayConfig as TOC } from '@/types';
import { TEXT_STYLES, FONTS } from './textStyles';

const textSwatches = ['#FFFFFF', '#000000', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899'];
const bgSwatches   = ['#000000', '#FFFFFF', '#1F2937', '#3B82F6', '#EF4444', '#F59E0B'];

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-xs font-semibold text-[var(--text)]">{title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

export default function TextOverlayConfig({
  config, onChange, isExpanded,
}: {
  config: TOC;
  onChange: (c: TOC) => void;
  isExpanded?: boolean;
}) {
  const padRef = useRef<HTMLDivElement>(null);

  const handlePadPointer = useCallback((e: React.PointerEvent) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    onChange({ ...config, customX: Math.round(x), customY: Math.round(y) });
  }, [config, onChange]);

  const handlePadDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handlePadPointer(e);
  }, [handlePadPointer]);

  return (
    <div>
      {/* Text — always visible, not collapsible */}
      <div className="pb-4 border-b border-[var(--border)]">
        <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Text</label>
        <div className="relative">
          <textarea
            value={config.text}
            onChange={(e) => onChange({ ...config, text: e.target.value })}
            placeholder="Enter overlay text…"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--accent-border)] focus:outline-none"
          />
          {config.text && (
            <span className="absolute bottom-2 right-2 text-[10px] tabular-nums text-[var(--text-muted)]">{config.text.length}</span>
          )}
        </div>

        {/* Words per line */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-medium text-[var(--text)]">Words Per Line</label>
            <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] tabular-nums font-medium text-[var(--text)]">
              {config.wordsPerLine ? config.wordsPerLine : 'No limit'}
            </span>
          </div>
          <input
            type="range" min={0} max={15}
            value={config.wordsPerLine ?? 0}
            onChange={(e) => onChange({ ...config, wordsPerLine: parseInt(e.target.value) || 0 })}
            className="w-full" style={{ accentColor: 'var(--primary)' }}
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>No limit</span><span>15</span>
          </div>
        </div>

        {/* Text Alignment */}
        <div className="mt-3">
          <label className="mb-1.5 block text-[11px] font-medium text-[var(--text)]">Text Alignment</label>
          <div className="flex gap-1.5">
            {([
              { value: 'left' as const, icon: AlignLeft, label: 'Left' },
              { value: 'center' as const, icon: AlignCenter, label: 'Center' },
              { value: 'right' as const, icon: AlignRight, label: 'Right' },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => onChange({ ...config, textAlign: value })}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-150 ${
                  (config.textAlign || 'center') === value
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Style */}
      <Section title="Style" defaultOpen={false}>
        <div className="grid grid-cols-3 gap-1.5">
          {TEXT_STYLES.map((style) => (
            <button
              key={style.id}
              onClick={() => onChange({ ...config, textStyle: style.id })}
              className={`relative flex items-center justify-center rounded-lg border py-2.5 px-2 text-[11px] font-medium transition-all duration-150 ${
                (config.textStyle || 'plain') === style.id
                  ? 'border-[var(--primary)] bg-[var(--accent)] shadow-sm'
                  : 'border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
              }`}
            >
              <span style={{ ...style.css, fontSize: '11px', lineHeight: '1' }}>
                {style.name}
              </span>
              {(config.textStyle || 'plain') === style.id && (
                <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* Font */}
      <Section title="Font" defaultOpen={false}>
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {FONTS.map((font) => (
              <button
                key={font.family}
                onClick={() => onChange({ ...config, fontFamily: font.family })}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition-all duration-150 ${
                  (config.fontFamily || 'sans-serif') === font.family
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
                }`}
                style={{ fontFamily: font.family }}
              >
                {font.name}
              </button>
            ))}
          </div>

          {/* Font Size */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] text-[var(--text-muted)]">Size</label>
              <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] tabular-nums font-medium text-[var(--text)]">
                {config.fontSize}px
              </span>
            </div>
            <input
              type="range" min={24} max={96}
              value={config.fontSize}
              onChange={(e) => onChange({ ...config, fontSize: parseInt(e.target.value) })}
              className="w-full" style={{ accentColor: 'var(--primary)' }}
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>24</span><span>96</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Position & Padding */}
      <Section title="Position">
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(['top', 'center', 'bottom', 'custom'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => onChange({ ...config, position: pos, ...(pos === 'custom' && !config.customX ? { customX: 50, customY: 50 } : {}) })}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium capitalize transition-all duration-150 ${
                  config.position === pos
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>

          {config.position === 'custom' && (
            <div>
              <div
                ref={padRef}
                className="relative mx-auto cursor-crosshair overflow-hidden rounded-xl border border-[var(--border)] bg-black"
                style={{ aspectRatio: '9/16', maxHeight: 180 }}
                onPointerDown={handlePadDown}
                onPointerMove={(e) => { if (e.buttons > 0) handlePadPointer(e); }}
              >
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute left-1/3 top-0 h-full w-px bg-white/50" />
                  <div className="absolute left-2/3 top-0 h-full w-px bg-white/50" />
                  <div className="absolute left-0 top-1/3 h-px w-full bg-white/50" />
                  <div className="absolute left-0 top-2/3 h-px w-full bg-white/50" />
                </div>
                <div
                  className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${config.customX ?? 50}%`, top: `${config.customY ?? 50}%` }}
                >
                  <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg" />
                  <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                </div>
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[var(--text-muted)]">
                <span>X: {config.customX ?? 50}%</span>
                <span>Y: {config.customY ?? 50}%</span>
              </div>
            </div>
          )}

          {/* Horizontal padding — controls text width / line wrapping */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">Text Margins</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-[var(--text-muted)]">Left (px)</label>
                <input
                  type="number" min={0} max={300} step={5}
                  value={config.paddingLeft ?? 0}
                  onChange={(e) => onChange({ ...config, paddingLeft: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs tabular-nums text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-[var(--text-muted)]">Right (px)</label>
                <input
                  type="number" min={0} max={300} step={5}
                  value={config.paddingRight ?? 0}
                  onChange={(e) => onChange({ ...config, paddingRight: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs tabular-nums text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Controls how many words fit per line. Higher values = narrower text.
            </p>
          </div>
        </div>
      </Section>

      {/* Color */}
      <Section title="Color">
        <div className="space-y-4">
          {/* Text color */}
          <div>
            <label className="mb-2 block text-[11px] text-[var(--text-muted)]">Text Color</label>
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5">
                {textSwatches.map((c) => (
                  <button
                    key={c}
                    onClick={() => onChange({ ...config, fontColor: c })}
                    className={`h-7 w-7 rounded-lg transition-all duration-100 ${
                      config.fontColor.toUpperCase() === c ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c, boxShadow: c === '#FFFFFF' ? 'inset 0 0 0 1px var(--border)' : undefined }}
                  />
                ))}
              </div>
              <div className="relative">
                <input
                  type="color" value={config.fontColor}
                  onChange={(e) => onChange({ ...config, fontColor: e.target.value })}
                  className="absolute inset-0 h-7 w-7 cursor-pointer opacity-0"
                />
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-[var(--border)]"
                >
                  <span className="text-[10px] text-[var(--text-muted)]">+</span>
                </div>
              </div>
            </div>
          </div>

          {/* Background */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Background Box</label>
              <button
                onClick={() => onChange({ ...config, bgColor: config.bgColor ? undefined : '#000000' })}
                className={`relative h-6 w-11 rounded-full transition-colors duration-300 ease-in-out ${config.bgColor ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`}
              >
                <span className={`absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-300 ease-in-out ${config.bgColor ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {config.bgColor && (
              <div className="mt-3 flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  {bgSwatches.map((c) => (
                    <button
                      key={c}
                      onClick={() => onChange({ ...config, bgColor: c })}
                      className={`h-6 w-6 rounded-md transition-all duration-100 ${
                        config.bgColor?.toUpperCase() === c ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c, boxShadow: c === '#FFFFFF' ? 'inset 0 0 0 1px var(--border)' : undefined }}
                    />
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="color" value={config.bgColor}
                    onChange={(e) => onChange({ ...config, bgColor: e.target.value })}
                    className="absolute inset-0 h-6 w-6 cursor-pointer opacity-0"
                  />
                  <div className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)]">+</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Timing */}
      <Section title="Timing">
        <div className="space-y-3">
          {/* Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
            <div>
              <p className="text-xs font-medium text-[var(--text)]">Entire Video</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Apply text for full duration</p>
            </div>
            <button
              onClick={() => onChange({ ...config, entireVideo: !config.entireVideo, startTime: undefined, duration: undefined })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ease-in-out ${config.entireVideo ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`}
            >
              <span className={`absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-300 ease-in-out ${config.entireVideo ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Time range inputs */}
          {!config.entireVideo && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Start (s)</label>
                <input
                  type="number" min={0} step={0.5}
                  value={config.startTime ?? ''}
                  onChange={(e) => onChange({ ...config, startTime: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Duration (s)</label>
                <input
                  type="number" min={0.5} step={0.5}
                  value={config.duration ?? ''}
                  onChange={(e) => onChange({ ...config, duration: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Full"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
