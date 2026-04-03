import { describe, expect, it } from 'vitest';
import {
  canFinalizeTemplateJobFromPersistedSteps,
  getFinalTemplateJobOutputUrl,
} from '@/lib/templateJobFinalization';

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
