import type { MiniAppStep, StepResult } from '@/types';

const SYNTHETIC_TEMPLATE_STEP_ID_RE = /^(?:recovered|webhook)-step-(\d+)$/;

type TemplateJobLike = {
  status?: string | null;
  currentStep?: number | null;
  pipeline?: MiniAppStep[] | null;
  stepResults?: StepResult[] | null;
};

export type DerivedTemplateJobStepState = {
  enabledSteps: MiniAppStep[];
  normalizedStepResults: StepResult[];
  completedStepIds: Set<string>;
  completedStepCount: number;
  contiguousCompletedCount: number;
  activeStepIndex: number | null;
  failedStepIndex: number | null;
};

function getEnabledSteps(pipeline?: MiniAppStep[] | null): MiniAppStep[] {
  return Array.isArray(pipeline) ? pipeline.filter((step) => step?.enabled) : [];
}

function normalizeTemplateJobStepId(stepId: string, enabledSteps: MiniAppStep[]): string {
  if (enabledSteps.some((step) => step.id === stepId)) {
    return stepId;
  }

  const match = stepId.match(SYNTHETIC_TEMPLATE_STEP_ID_RE);
  if (!match) {
    return stepId;
  }

  const stepIndex = Number.parseInt(match[1] || '', 10);
  return enabledSteps[stepIndex]?.id || stepId;
}

export function normalizeTemplateJobStepResults(
  pipeline?: MiniAppStep[] | null,
  stepResults?: StepResult[] | null,
): StepResult[] {
  if (!Array.isArray(stepResults) || stepResults.length === 0) {
    return [];
  }

  const enabledSteps = getEnabledSteps(pipeline);
  const normalized = stepResults.map((result) => {
    if (!result || typeof result.stepId !== 'string') {
      return result;
    }

    const stepId = normalizeTemplateJobStepId(result.stepId, enabledSteps);
    const matchedStep = enabledSteps.find((step) => step.id === stepId);

    return {
      ...result,
      stepId,
      ...(matchedStep ? { type: matchedStep.type } : {}),
    };
  });

  const deduped: StepResult[] = [];
  const seen = new Set<string>();
  for (let i = normalized.length - 1; i >= 0; i--) {
    const result = normalized[i];
    const key = typeof result?.stepId === 'string' ? result.stepId : `__unknown_${i}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(result);
  }

  return deduped.reverse();
}

function getContiguousCompletedCount(enabledSteps: MiniAppStep[], completedStepIds: Set<string>): number {
  let completedCount = 0;
  while (
    completedCount < enabledSteps.length &&
    completedStepIds.has(enabledSteps[completedCount].id)
  ) {
    completedCount++;
  }
  return completedCount;
}

function clampCurrentStep(currentStep: number | null | undefined, totalSteps: number): number {
  if (!Number.isFinite(currentStep)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(currentStep || 0), totalSteps));
}

export function deriveTemplateJobStepState(job: TemplateJobLike): DerivedTemplateJobStepState {
  const enabledSteps = getEnabledSteps(job.pipeline);
  const normalizedStepResults = normalizeTemplateJobStepResults(job.pipeline, job.stepResults);
  const completedStepIds = new Set(
    normalizedStepResults
      .map((result) => result?.stepId)
      .filter((stepId): stepId is string => typeof stepId === 'string'),
  );
  const contiguousCompletedCount = getContiguousCompletedCount(enabledSteps, completedStepIds);
  const completedStepCount =
    job.status === 'completed' ? enabledSteps.length : contiguousCompletedCount;
  const boundedCurrentStep = clampCurrentStep(job.currentStep, enabledSteps.length);
  const nextIncompleteIndex =
    contiguousCompletedCount < enabledSteps.length ? contiguousCompletedCount : null;

  let activeStepIndex: number | null = null;
  if (job.status === 'processing') {
    const currentStepId = enabledSteps[boundedCurrentStep]?.id;
    if (currentStepId && !completedStepIds.has(currentStepId)) {
      activeStepIndex = boundedCurrentStep;
    } else {
      activeStepIndex = nextIncompleteIndex;
    }
  }

  let failedStepIndex: number | null = null;
  if (job.status === 'failed') {
    const currentStepId = enabledSteps[boundedCurrentStep]?.id;
    if (currentStepId && !completedStepIds.has(currentStepId)) {
      failedStepIndex = boundedCurrentStep;
    } else {
      failedStepIndex = nextIncompleteIndex;
    }
  }

  return {
    enabledSteps,
    normalizedStepResults,
    completedStepIds,
    completedStepCount,
    contiguousCompletedCount,
    activeStepIndex,
    failedStepIndex,
  };
}
