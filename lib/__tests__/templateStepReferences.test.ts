import { describe, expect, it } from 'vitest';
import { buildStepOutputReferenceCounts, getStepOutputReferencesForStep, SOURCE_VIDEO_STEP_ID } from '@/lib/templateStepReferences';
import type { MiniAppStep } from '@/types';

describe('getStepOutputReferencesForStep', () => {
  it('reads attach-video step references', () => {
    const step = {
      id: 'attach',
      type: 'attach-video',
      enabled: true,
      config: {
        videoUrl: '',
        position: 'after',
        sourceStepId: 'text-step',
      },
    } as MiniAppStep;

    expect(getStepOutputReferencesForStep(step)).toEqual(['text-step']);
  });

  it('reads compose layer references including source video', () => {
    const step = {
      id: 'compose',
      type: 'compose',
      enabled: true,
      config: {
        canvasWidth: 1080,
        canvasHeight: 1920,
        aspectRatio: '9:16',
        preset: null,
        backgroundColor: '#000000',
        layers: [
          {
            id: 'layer-1',
            type: 'video',
            source: { type: 'step-output', url: '', stepId: 'attach-step' },
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            zIndex: 0,
            fit: 'cover',
          },
          {
            id: 'layer-2',
            type: 'video',
            source: { type: 'step-output', url: '', stepId: SOURCE_VIDEO_STEP_ID },
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            zIndex: 1,
            fit: 'contain',
          },
        ],
      },
    } as MiniAppStep;

    expect(getStepOutputReferencesForStep(step)).toEqual(['attach-step', SOURCE_VIDEO_STEP_ID]);
  });
});

describe('buildStepOutputReferenceCounts', () => {
  it('counts repeated future references and ignores disabled steps', () => {
    const steps = [
      {
        id: 'compose-a',
        type: 'compose',
        enabled: true,
        config: {
          canvasWidth: 1080,
          canvasHeight: 1920,
          aspectRatio: '9:16',
          preset: null,
          backgroundColor: '#000000',
          layers: [
            {
              id: 'layer-1',
              type: 'video',
              source: { type: 'step-output', url: '', stepId: 'step-1' },
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              zIndex: 0,
              fit: 'cover',
            },
            {
              id: 'layer-2',
              type: 'video',
              source: { type: 'step-output', url: '', stepId: 'step-1' },
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              zIndex: 1,
              fit: 'cover',
            },
          ],
        },
      },
      {
        id: 'attach-a',
        type: 'attach-video',
        enabled: true,
        config: {
          videoUrl: '',
          position: 'before',
          sourceStepId: 'step-2',
        },
      },
      {
        id: 'disabled-compose',
        type: 'compose',
        enabled: false,
        config: {
          canvasWidth: 1080,
          canvasHeight: 1920,
          aspectRatio: '9:16',
          preset: null,
          backgroundColor: '#000000',
          layers: [
            {
              id: 'layer-3',
              type: 'video',
              source: { type: 'step-output', url: '', stepId: 'step-3' },
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              zIndex: 0,
              fit: 'cover',
            },
          ],
        },
      },
    ] as MiniAppStep[];

    expect(Array.from(buildStepOutputReferenceCounts(steps).entries())).toEqual([
      ['step-1', 2],
      ['step-2', 1],
    ]);
  });
});
