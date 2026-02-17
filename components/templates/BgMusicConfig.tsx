'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Music, Video, Film, Layers, Loader2, Play, Pause, Volume2, VolumeX, ChevronDown, TrendingUp, Library, RefreshCw, Plus } from 'lucide-react';
import { useMusicTracks } from '@/hooks/useMusicTracks';
import { useTrendingTracks } from '@/hooks/useTrendingTracks';
import type { BgMusicConfig as BMC, MiniAppStep, MusicTrack, TrendingTrack } from '@/types';

const stepMeta: Record<string, { icon: typeof Video; label: string }> = {
  'video-generation':       { icon: Video,  label: 'Video Generation' },
  'batch-video-generation': { icon: Layers, label: 'Batch Video Gen' },
  'attach-video':           { icon: Film,   label: 'Attach Video' },
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type MusicTab = 'library' | 'trending';

export default function BgMusicConfig({
  config, onChange, steps = [], currentStepId = '',
}: {
  config: BMC;
  onChange: (c: BMC) => void;
  steps?: MiniAppStep[];
  currentStepId?: string;
}) {
  const { tracks, uploadTrack, addToLibrary, getSignedUrl } = useMusicTracks();
  const [savingToLibrary, setSavingToLibrary] = useState<string | null>(null);
  const { tracks: trendingTracks, stale, loading: trendingLoading, refreshing, refreshTracks } = useTrendingTracks();
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [musicTab, setMusicTab] = useState<MusicTab>('library');

  const targetSteps = steps.filter(
    (s) => s.id !== currentStepId && (s.type === 'video-generation' || s.type === 'batch-video-generation' || s.type === 'attach-video'),
  );

  const selectedIds = config.applyToSteps ?? [];
  const isAllMode = selectedIds.length === 0;

  const selectedLibraryTrack = tracks.find((t) => t.id === config.trackId);
  const selectedTrendingTrack = trendingTracks.find((t) => t.id === config.trendingTrackId);
  const hasSelection = !!selectedLibraryTrack || !!selectedTrendingTrack;
  const selectedDisplayName = selectedLibraryTrack?.name || selectedTrendingTrack?.title || null;
  const selectedDisplayDuration = selectedLibraryTrack?.duration ?? selectedTrendingTrack?.duration ?? null;

  useEffect(() => { if (audioRef.current) audioRef.current.volume = config.volume / 100; }, [config.volume]);
  useEffect(() => { if (audioRef.current) audioRef.current.muted = isMuted; }, [isMuted]);
  useEffect(() => { return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } }; }, []);

  const setupAudio = useCallback((url: string, trackId: string) => {
    const audio = new Audio(url);
    audio.volume = config.volume / 100;
    audio.muted = isMuted;
    audio.ontimeupdate = () => { setAudioProgress(audio.currentTime); setAudioDuration(audio.duration || 0); };
    audio.onended = () => { setIsPlaying(false); setAudioProgress(0); };
    audio.onloadedmetadata = () => { setAudioDuration(audio.duration || 0); };
    audio.onerror = () => { setIsPlaying(false); setPlayingTrackId(null); };
    audioRef.current = audio;
    setPlayingTrackId(trackId);
    setAudioProgress(0);
    audio.play().then(() => setIsPlaying(true)).catch(() => { setIsPlaying(false); setPlayingTrackId(null); });
  }, [config.volume, isMuted]);

  const togglePlay = useCallback(async (trackId: string, gcsUrl?: string) => {
    if (playingTrackId === trackId && audioRef.current) {
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
      else { audioRef.current.play(); setIsPlaying(true); }
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    if (!gcsUrl) return;
    const url = await getSignedUrl(gcsUrl);
    setupAudio(url, trackId);
  }, [playingTrackId, isPlaying, getSignedUrl, setupAudio]);

  const selectStep = (id: string) => {
    if (isAllMode) { onChange({ ...config, applyToSteps: [id] }); return; }
    if (selectedIds.includes(id) && selectedIds.length === 1) return;
    if (selectedIds.includes(id)) { onChange({ ...config, applyToSteps: selectedIds.filter((s) => s !== id) }); return; }
    const next = [...selectedIds, id];
    if (next.length === targetSteps.length) onChange({ ...config, applyToSteps: [] });
    else onChange({ ...config, applyToSteps: next });
  };

  const selectAll = () => onChange({ ...config, applyToSteps: [] });

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const track = await uploadTrack(file, file.name.replace(/\.\w+$/, ''));
      if (track) onChange({ ...config, trackId: track.id, trendingTrackId: undefined, customTrackUrl: track.gcsUrl });
    } catch (err) { console.error('Upload track error:', err); }
    finally { setIsUploading(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) handleFile(file); };

  const selectLibraryTrack = (track: MusicTrack) => {
    onChange({ ...config, trackId: track.id, trendingTrackId: undefined, customTrackUrl: track.gcsUrl });
  };

  const selectTrendingTrack = (track: TrendingTrack) => {
    if (!track.gcsUrl) return;
    onChange({ ...config, trackId: undefined, trendingTrackId: track.id, customTrackUrl: track.gcsUrl });
  };

  const handleAddToLibrary = async (track: TrendingTrack) => {
    if (!track.gcsUrl) return;
    setSavingToLibrary(track.id);
    try {
      await addToLibrary(track.title + (track.author ? ` - ${track.author}` : ''), track.gcsUrl, track.duration ?? undefined);
    } catch (err) { console.error('Add to library error:', err); }
    finally { setSavingToLibrary(null); }
  };

  const progressPercent = audioDuration > 0 ? (audioProgress / audioDuration) * 100 : 0;
  const nowPlayingTrackId = selectedLibraryTrack?.id || selectedTrendingTrack?.id || null;

  const handleNowPlayingToggle = () => {
    if (selectedLibraryTrack) togglePlay(selectedLibraryTrack.id, selectedLibraryTrack.gcsUrl);
    else if (selectedTrendingTrack) togglePlay(selectedTrendingTrack.id, selectedTrendingTrack.gcsUrl);
  };

  return (
    <div className="space-y-5">
      {/* Apply to steps */}
      {targetSteps.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Apply music to</label>
          <div className="space-y-1.5">
            <button
              onClick={selectAll}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ${
                isAllMode ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
              }`}
            >
              <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isAllMode ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border)]'}`}>
                {isAllMode && <div className="h-2 w-2 rounded-sm bg-white" />}
              </div>
              <span className={`text-xs font-medium ${isAllMode ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>All steps</span>
            </button>

            {targetSteps.map((s) => {
              const meta = stepMeta[s.type];
              if (!meta) return null;
              const Icon = meta.icon;
              const isChecked = isAllMode || selectedIds.includes(s.id);
              const stepIndex = steps.findIndex((st) => st.id === s.id);
              const stepAudioMode = config.audioModePerStep?.[s.id] ?? 'mix';

              return (
                <div key={s.id} className={`rounded-lg border transition-all duration-150 ${
                  isChecked ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
                }`}>
                  <button onClick={() => selectStep(s.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isChecked ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border)]'}`}>
                      {isChecked && <div className="h-2 w-2 rounded-sm bg-white" />}
                    </div>
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: isChecked ? 'var(--primary)' : 'var(--text-muted)' }} />
                    <span className={`text-xs font-medium ${isChecked ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                      {meta.label} <span className="text-[var(--text-muted)]">#{stepIndex + 1}</span>
                    </span>
                  </button>
                  {isChecked && (
                    <div className="flex items-center gap-1.5 px-3 pb-2">
                      <span className="text-[11px] text-[var(--text-muted)]">Audio:</span>
                      <div className="flex gap-0.5 rounded-md border border-[var(--border)] bg-[var(--background)] p-0.5">
                        {(['mix', 'replace'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={(e) => { e.stopPropagation(); onChange({ ...config, audioModePerStep: { ...config.audioModePerStep, [s.id]: mode } }); }}
                            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all duration-150 ${
                              stepAudioMode === mode ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                            }`}
                          >{mode === 'mix' ? 'Mix' : 'Replace'}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="rounded-lg bg-[var(--accent)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Music will be trimmed to match the video duration. If the track is longer than the video, only the first part will play.
      </p>

      {/* ── Now Playing ── */}
      {hasSelection && (
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-3">
          <div className="flex items-center gap-2.5">
            {selectedTrendingTrack?.coverUrl && (
              <img src={selectedTrendingTrack.coverUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            )}
            <button
              onClick={handleNowPlayingToggle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white transition-transform hover:scale-105 active:scale-95"
            >
              {isPlaying && playingTrackId === nowPlayingTrackId ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-[var(--text)]">{selectedDisplayName}</div>
              {selectedTrendingTrack?.author && <div className="truncate text-[10px] text-[var(--text-muted)]">{selectedTrendingTrack.author}</div>}
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 rounded-full bg-[var(--border)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--primary)] transition-all duration-200" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                  {playingTrackId === nowPlayingTrackId && audioDuration > 0
                    ? `${formatDuration(audioProgress)} / ${formatDuration(audioDuration)}`
                    : selectedDisplayDuration ? formatDuration(selectedDisplayDuration) : '--:--'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                isMuted ? 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400' : 'text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >{isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
          </div>
        </div>
      )}

      {/* ── Tab Switcher ── */}
      <div>
        <div className="mb-2 flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--accent)] p-0.5">
          <button
            onClick={() => setMusicTab('library')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              musicTab === 'library' ? 'bg-[var(--background)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          ><Library className="h-3.5 w-3.5" />My Library</button>
          <button
            onClick={() => setMusicTab('trending')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              musicTab === 'trending' ? 'bg-[var(--background)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          ><TrendingUp className="h-3.5 w-3.5" />Trending</button>
        </div>

        {/* ── My Library Tab ── */}
        {musicTab === 'library' && (
          <>
            <div className="relative">
              <button
                onClick={() => setLibraryOpen(!libraryOpen)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
                  libraryOpen ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
                  <Music className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  {selectedLibraryTrack ? (
                    <>
                      <div className="truncate text-xs font-medium text-[var(--text)]">{selectedLibraryTrack.name}</div>
                      {selectedLibraryTrack.duration != null && <div className="text-[10px] tabular-nums text-[var(--text-muted)]">{formatDuration(selectedLibraryTrack.duration)}</div>}
                    </>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">{tracks.length > 0 ? 'Choose a track...' : 'No tracks — upload below'}</div>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${libraryOpen ? 'rotate-180' : ''}`} />
              </button>

              {libraryOpen && tracks.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-36 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-1.5 shadow-lg">
                  {tracks.map((t) => {
                    const isSelected = config.trackId === t.id;
                    const isCurrentlyPlaying = playingTrackId === t.id && isPlaying;
                    return (
                      <div key={t.id} className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all duration-100 ${isSelected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--accent)]'}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); selectLibraryTrack(t); togglePlay(t.id, t.gcsUrl); }}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                            isCurrentlyPlaying ? 'bg-[var(--primary)] text-white' : 'bg-[var(--accent)] text-[var(--text-muted)] group-hover:bg-[var(--primary)] group-hover:text-white'
                          }`}
                        >{isCurrentlyPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}</button>
                        <button onClick={() => { selectLibraryTrack(t); setLibraryOpen(false); }} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-xs font-medium text-[var(--text)]">{t.name} {t.isDefault && <span className="text-[var(--text-muted)]">(Default)</span>}</div>
                          {t.duration != null && <div className="text-[10px] tabular-nums text-[var(--text-muted)]">{formatDuration(t.duration)}</div>}
                        </button>
                        {isSelected && <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Add to Library</label>
              <input ref={fileRef} type="file" accept="audio/*" onChange={handleUpload} className="hidden" disabled={isUploading} />
              <div
                onClick={() => !isUploading && fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (isUploading) return; const file = e.dataTransfer.files[0]; if (file?.type.startsWith('audio/')) handleFile(file); }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-xs font-medium transition-colors ${
                  isUploading ? 'border-[var(--primary)] bg-[var(--accent)] text-[var(--text)] cursor-wait'
                    : isDragging ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--text)] cursor-pointer'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-border)] hover:text-[var(--text)] cursor-pointer'
                }`}
              >
                {isUploading ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading &amp; saving to library...</>)
                  : (<><Upload className="h-3.5 w-3.5" />{isDragging ? 'Drop audio here' : 'Upload audio file'}</>)}
              </div>
            </div>
          </>
        )}

        {/* ── Trending Tab ── */}
        {musicTab === 'trending' && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]">
            {/* Header with refresh button */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-[11px] text-[var(--text-muted)]">
                {trendingTracks.length > 0 ? `${trendingTracks.length} tracks` : 'No tracks yet'}
                {stale && trendingTracks.length > 0 && ' · Outdated'}
              </span>
              <button
                onClick={refreshTracks}
                disabled={refreshing}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Fetching...' : trendingTracks.length === 0 ? 'Fetch Tracks' : 'Refresh'}
              </button>
            </div>

            {refreshing && trendingTracks.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching &amp; downloading trending tracks...
              </div>
            ) : trendingLoading && trendingTracks.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : trendingTracks.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                Click &quot;Fetch Tracks&quot; to load TikTok trending music.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto p-1.5">
                {trendingTracks.map((t) => {
                  const isSelected = config.trendingTrackId === t.id;
                  const isCurrentlyPlaying = playingTrackId === t.id && isPlaying;
                  const hasAudio = !!t.gcsUrl;

                  return (
                    <div
                      key={t.id}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-100 ${
                        isSelected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--accent)]'
                      }`}
                    >
                      {/* Cover art */}
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                        {t.coverUrl ? (
                          <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[var(--accent)]">
                            <Music className="h-4 w-4 text-[var(--text-muted)]" />
                          </div>
                        )}
                      </div>

                      {/* Play/Pause button */}
                      <button
                        onClick={() => hasAudio && togglePlay(t.id, t.gcsUrl)}
                        disabled={!hasAudio}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                          isCurrentlyPlaying
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-[var(--accent)] text-[var(--text-muted)] hover:bg-[var(--primary)] hover:text-white'
                        } ${!hasAudio ? 'opacity-30' : ''}`}
                      >
                        {isCurrentlyPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
                      </button>

                      {/* Track info */}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-[var(--text)]">{t.title}</div>
                        {t.author && <div className="truncate text-[10px] text-[var(--text-muted)]">{t.author}</div>}
                        {t.duration != null && <div className="text-[10px] tabular-nums text-[var(--text-muted)]">{formatDuration(t.duration)}</div>}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1">
                        {/* Add to library */}
                        {savingToLibrary === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
                        ) : (
                          <button
                            onClick={() => handleAddToLibrary(t)}
                            disabled={!hasAudio}
                            title="Save to My Library"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--primary)] disabled:opacity-30"
                          ><Plus className="h-3.5 w-3.5" /></button>
                        )}
                        {/* Use / selected */}
                        {isSelected ? (
                          <div className="flex h-7 w-7 items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                          </div>
                        ) : (
                          <button
                            onClick={() => selectTrendingTrack(t)}
                            disabled={!hasAudio}
                            className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-30"
                          >Use</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Volume ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--text-muted)]">Volume</label>
          <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] tabular-nums font-medium text-[var(--text)]">{config.volume}%</span>
        </div>
        <input type="range" min={0} max={100} value={config.volume} onChange={(e) => onChange({ ...config, volume: parseInt(e.target.value) })} className="w-full" style={{ accentColor: 'var(--primary)' }} />
      </div>

      {/* ── Fade ── */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Fade</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] text-[var(--text-muted)]">In (s)</label>
            <input type="number" min={0} step={0.5} value={config.fadeIn ?? ''} onChange={(e) => onChange({ ...config, fadeIn: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="0"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Out (s)</label>
            <input type="number" min={0} step={0.5} value={config.fadeOut ?? ''} onChange={(e) => onChange({ ...config, fadeOut: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="0"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
