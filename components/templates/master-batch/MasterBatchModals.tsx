'use client';

import type { MasterConfig, TemplateJob } from '@/types';
import MasterJobModal from '@/components/templates/MasterJobModal';
import RegenerateModal from '@/components/templates/RegenerateModal';

type JobPostRecord = {
  platform: string;
  status: string;
  platformPostUrl?: string;
  latePostId?: string;
};

type Props = {
  modalJob: TemplateJob | null;
  regenerateJob: TemplateJob | null;
  masterConfig?: MasterConfig;
  signedModelImages: Record<string, string>;
  jobPosts: Record<string, JobPostRecord[]>;
  busyJobIds: Set<string>;
  onCloseModalJob: () => void;
  onCloseRegenerate: () => void;
  onPost: (jobId: string) => void;
  onRepost: (jobId: string) => void;
  onReject: (jobId: string) => void;
  onQuickRegenerate: (jobId: string) => void;
  onEditRegenerateOpen: (job: TemplateJob) => void;
  onEditRegenerateSubmit: (jobId: string, overrides?: { imageUrl?: string; imageId?: string }) => void;
  onEditJobOverrides?: (job: TemplateJob) => void;
  jobsWithOverrides?: Set<string>;
};

function getModelInfoWithSignedImage(
  masterConfig: MasterConfig | undefined,
  signedModelImages: Record<string, string>,
  modelId: string | undefined,
) {
  if (!modelId) return undefined;
  const modelInfo = masterConfig?.models?.find((model) => model.modelId === modelId);
  if (!modelInfo) return undefined;
  const signedImageUrl = modelInfo.primaryImageUrl ? signedModelImages[modelInfo.primaryImageUrl] : undefined;
  return {
    ...modelInfo,
    primaryImageUrl: signedImageUrl || modelInfo.primaryImageUrl,
  };
}

export default function MasterBatchModals({
  modalJob,
  regenerateJob,
  masterConfig,
  signedModelImages,
  jobPosts,
  busyJobIds,
  onCloseModalJob,
  onCloseRegenerate,
  onPost,
  onRepost,
  onReject,
  onQuickRegenerate,
  onEditRegenerateOpen,
  onEditRegenerateSubmit,
  onEditJobOverrides,
  jobsWithOverrides,
}: Props) {
  const modalModelInfo = getModelInfoWithSignedImage(masterConfig, signedModelImages, modalJob?.modelId);
  const regenerateModelInfo = getModelInfoWithSignedImage(masterConfig, signedModelImages, regenerateJob?.modelId);

  return (
    <>
      {modalJob && (
        <MasterJobModal
          job={modalJob}
          modelInfo={modalModelInfo}
          onClose={onCloseModalJob}
          onPost={() => onPost(modalJob.id)}
          onRepost={() => onRepost(modalJob.id)}
          onReject={() => onReject(modalJob.id)}
          onQuickRegenerate={() => onQuickRegenerate(modalJob.id)}
          onEditRegenerate={() => onEditRegenerateOpen(modalJob)}
          onEditOverrides={onEditJobOverrides ? () => onEditJobOverrides(modalJob) : undefined}
          hasOverrides={jobsWithOverrides?.has(modalJob.id)}
          posting={busyJobIds.has(modalJob.id)}
          regenerating={false}
          postRecords={jobPosts[modalJob.id]}
        />
      )}
      {regenerateJob && (
        <RegenerateModal
          job={regenerateJob}
          modelInfo={regenerateModelInfo}
          onClose={onCloseRegenerate}
          onRegenerate={onEditRegenerateSubmit}
        />
      )}
    </>
  );
}
