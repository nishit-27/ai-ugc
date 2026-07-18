import { db } from './drizzle';
import { twitterPipelines } from './schema';
import { eq, desc } from 'drizzle-orm';
import type { TwitterPipelineStep } from '@/types';

// One result row per (step, account) produced during execution. Stored on the
// pipeline so /jobs can render an audit trail after the background run finishes.
export type TwitterPipelineResult = {
  stepId: string;
  stepType: string;
  accountId: string;
  modelName?: string;
  success: boolean;
  error?: string;
  postUrl?: string;
  latePostId?: string;
};

export async function createTwitterPipeline(data: {
  name: string;
  steps?: TwitterPipelineStep[];
  accountIds?: string[];
  modelIds?: string[];
  publishMode?: string;
  scheduledFor?: Date;
  timezone?: string;
  createdBy?: string;
}) {
  const [row] = await db
    .insert(twitterPipelines)
    .values({
      name: data.name,
      steps: data.steps || [],
      accountIds: data.accountIds || [],
      modelIds: data.modelIds || [],
      publishMode: data.publishMode || 'now',
      scheduledFor: data.scheduledFor,
      timezone: data.timezone,
      createdBy: data.createdBy,
    })
    .returning();
  return row;
}

export async function getTwitterPipeline(id: string) {
  const [row] = await db
    .select()
    .from(twitterPipelines)
    .where(eq(twitterPipelines.id, id));
  return row || null;
}

export async function getAllTwitterPipelines() {
  return db
    .select()
    .from(twitterPipelines)
    .orderBy(desc(twitterPipelines.createdAt));
}

export async function updateTwitterPipeline(
  id: string,
  data: {
    name?: string;
    status?: string;
    steps?: TwitterPipelineStep[];
    accountIds?: string[];
    modelIds?: string[];
    publishMode?: string;
    results?: TwitterPipelineResult[];
    scheduledFor?: Date | null;
    timezone?: string;
    error?: string;
    completedAt?: Date;
  }
) {
  const [row] = await db
    .update(twitterPipelines)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(twitterPipelines.id, id))
    .returning();
  return row;
}

export async function deleteTwitterPipeline(id: string) {
  await db.delete(twitterPipelines).where(eq(twitterPipelines.id, id));
}
