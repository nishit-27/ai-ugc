import { describe, expect, it } from 'vitest';
import type { MiniAppStep } from '@/types';
import {
  canFinalizeTemplateJobFromPersistedSteps,
  getFinalTemplateJobOutputUrl,
} from '@/lib/templateJobFinalization';
import {
  deriveTemplateJobStepState,
  normalizeTemplateJobStepResults,
} from '@/lib/templateJobState';

describe('getFinalTemplateJobOutputUrl', () => {
  it('returns the last video output URL', () => {
    expect(getFinalTemplateJobOutputUrl([
      { stepId: 'a', type: 'video-generation', label: 'A', outputUrl: 'https://example.com/a.mp4' },
      { stepId: 'b', type: 'attach-video', label: 'B', outputUrl: 'https://example.com/b.mp4' },
    ])).toBe('https://example.com/b.mp4');
  });

  it('returns a carousel output token for carousel jobs', () => {
    expect(getFinalTemplateJobOutputUrl([
      {
        stepId: 'carousel',
        type: 'carousel',
        label: 'Carousel',
        outputUrl: 'https://example.com/1.jpg',
        outputUrls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
        isCarousel: true,
      },
    ])).toBe('carousel:["https://example.com/1.jpg","https://example.com/2.jpg"]');
  });
});

describe('canFinalizeTemplateJobFromPersistedSteps', () => {
  it('returns true when all steps are persisted and the final output exists', () => {
    expect(canFinalizeTemplateJobFromPersistedSteps(4, 4, [
      { stepId: '1', type: 'video-generation', label: 'Step 1', outputUrl: 'https://example.com/1.mp4' },
      { stepId: '2', type: 'text-overlay', label: 'Step 2', outputUrl: 'https://example.com/2.mp4' },
      { stepId: '3', type: 'bg-music', label: 'Step 3', outputUrl: 'https://example.com/3.mp4' },
      { stepId: '4', type: 'attach-video', label: 'Step 4', outputUrl: 'https://example.com/4.mp4' },
    ])).toBe(true);
  });

  it('returns false when the last step has not been persisted yet', () => {
    expect(canFinalizeTemplateJobFromPersistedSteps(3, 4, [
      { stepId: '1', type: 'video-generation', label: 'Step 1', outputUrl: 'https://example.com/1.mp4' },
      { stepId: '2', type: 'text-overlay', label: 'Step 2', outputUrl: 'https://example.com/2.mp4' },
      { stepId: '3', type: 'bg-music', label: 'Step 3', outputUrl: 'https://example.com/3.mp4' },
    ])).toBe(false);
  });
});

describe('normalizeTemplateJobStepResults', () => {
  const pipeline: MiniAppStep[] = [
    { id: 'gen-1', type: 'video-generation', enabled: true, config: { mode: 'subtle-animation' as const } },
    { id: 'overlay-1', type: 'text-overlay', enabled: true, config: { text: 'hi', position: 'center' as const, fontSize: 24, fontColor: '#fff' } },
  ];

  it('maps recovered synthetic step ids back to the real pipeline step ids', () => {
    expect(normalizeTemplateJobStepResults(pipeline, [
      { stepId: 'recovered-step-0', type: 'video-generation', label: 'Recovered', outputUrl: 'https://example.com/1.mp4' },
      { stepId: 'overlay-1', type: 'text-overlay', label: 'Overlay', outputUrl: 'https://example.com/2.mp4' },
    ])).toEqual([
      { stepId: 'gen-1', type: 'video-generation', label: 'Recovered', outputUrl: 'https://example.com/1.mp4' },
      { stepId: 'overlay-1', type: 'text-overlay', label: 'Overlay', outputUrl: 'https://example.com/2.mp4' },
    ]);
  });

  it('keeps the latest result when synthetic and real ids refer to the same step', () => {
    expect(normalizeTemplateJobStepResults(pipeline, [
      { stepId: 'gen-1', type: 'video-generation', label: 'Original', outputUrl: 'https://example.com/old.mp4' },
      { stepId: 'recovered-step-0', type: 'video-generation', label: 'Recovered', outputUrl: 'https://example.com/new.mp4' },
    ])).toEqual([
      { stepId: 'gen-1', type: 'video-generation', label: 'Recovered', outputUrl: 'https://example.com/new.mp4' },
    ]);
  });
});

describe('deriveTemplateJobStepState', () => {
  const pipeline: MiniAppStep[] = [
    { id: 'gen-1', type: 'video-generation', enabled: true, config: { mode: 'subtle-animation' as const } },
    { id: 'overlay-1', type: 'text-overlay', enabled: true, config: { text: 'hi', position: 'center' as const, fontSize: 24, fontColor: '#fff' } },
    { id: 'attach-1', type: 'attach-video', enabled: true, config: { videoUrl: 'https://example.com/clip.mp4', position: 'after' as const } },
  ];

  it('derives the active step from persisted results instead of overstating progress', () => {
    const state = deriveTemplateJobStepState({
      status: 'processing',
      currentStep: 2,
      pipeline,
      stepResults: [
        { stepId: 'gen-1', type: 'video-generation', label: 'Gen', outputUrl: 'https://example.com/1.mp4' },
      ],
    });

    expect(state.completedStepCount).toBe(1);
    expect(state.activeStepIndex).toBe(2);
  });

  it('falls back to the first incomplete step when the stored current step is already marked done', () => {
    const state = deriveTemplateJobStepState({
      status: 'failed',
      currentStep: 1,
      pipeline,
      stepResults: [
        { stepId: 'gen-1', type: 'video-generation', label: 'Gen', outputUrl: 'https://example.com/1.mp4' },
        { stepId: 'overlay-1', type: 'text-overlay', label: 'Overlay', outputUrl: 'https://example.com/2.mp4' },
      ],
    });

    expect(state.failedStepIndex).toBe(2);
  });
});
