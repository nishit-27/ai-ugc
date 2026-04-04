import type { AttachVideoConfig, ComposeConfig, MiniAppStep } from '@/types';

export const SOURCE_VIDEO_STEP_ID = '__video-source';

export function getStepOutputReferencesForStep(step: MiniAppStep): string[] {
  if (!step.enabled) {
    return [];
  }

  switch (step.type) {
    case 'attach-video': {
      const cfg = step.config as AttachVideoConfig;
      return cfg.sourceStepId ? [cfg.sourceStepId] : [];
    }
    case 'compose': {
      const cfg = step.config as ComposeConfig;
      if (!Array.isArray(cfg.layers)) {
        return [];
      }

      return cfg.layers
        .filter((layer) => layer.source.type === 'step-output' && !!layer.source.stepId)
        .map((layer) => layer.source.stepId as string);
    }
    default:
      return [];
  }
}

export function buildStepOutputReferenceCounts(steps: MiniAppStep[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const step of steps) {
    for (const stepId of getStepOutputReferencesForStep(step)) {
      counts.set(stepId, (counts.get(stepId) ?? 0) + 1);
    }
  }

  return counts;
}
