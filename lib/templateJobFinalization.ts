export type TemplateJobStepResult = {
  stepId: string;
  type: string;
  label: string;
  outputUrl: string;
  outputUrls?: string[];
  isCarousel?: boolean;
};

export function getFinalTemplateJobOutputUrl(
  stepResults: TemplateJobStepResult[] | null | undefined,
): string | null {
  if (!Array.isArray(stepResults) || stepResults.length === 0) {
    return null;
  }

  const lastResult = stepResults[stepResults.length - 1];
  if (lastResult?.isCarousel && Array.isArray(lastResult.outputUrls) && lastResult.outputUrls.length > 0) {
    return `carousel:${JSON.stringify(lastResult.outputUrls)}`;
  }

  return lastResult?.outputUrl || null;
}

export function canFinalizeTemplateJobFromPersistedSteps(
  currentStep: number | null | undefined,
  totalSteps: number | null | undefined,
  stepResults: TemplateJobStepResult[] | null | undefined,
): boolean {
  if (!totalSteps || totalSteps <= 0) {
    return false;
  }

  if ((currentStep ?? 0) < totalSteps) {
    return false;
  }

  if (!Array.isArray(stepResults) || stepResults.length < totalSteps) {
    return false;
  }

  return !!getFinalTemplateJobOutputUrl(stepResults);
}
