import { db } from './drizzle';
import { modelImages, models } from './schema';
import { eq, desc, asc, ne, inArray } from 'drizzle-orm';
import { sql as rawSql } from './db-client';

export async function createModelImage({ modelId, gcsUrl, filename, originalName, fileSize, isPrimary }) {
  if (isPrimary) {
    await db.update(modelImages).set({ isPrimary: false }).where(eq(modelImages.modelId, modelId));
  }

  const [row] = await db.insert(modelImages).values({
    modelId,
    gcsUrl,
    filename,
    originalName: originalName || null,
    fileSize: fileSize || null,
    isPrimary: isPrimary || false,
  }).returning();

  if (isPrimary) {
    await db.update(models).set({ avatarUrl: gcsUrl }).where(eq(models.id, modelId));
  }

  return row;
}

export async function getModelImage(id) {
  const [row] = await db.select().from(modelImages).where(eq(modelImages.id, id));
  return row || null;
}

export async function getModelImages(modelId) {
  return db.select().from(modelImages)
    .where(eq(modelImages.modelId, modelId))
    .orderBy(desc(modelImages.isPrimary), asc(modelImages.createdAt));
}

export async function getModelImageCountsForModels(modelIds) {
  if (!modelIds || modelIds.length === 0) return [];
  const result = await rawSql`
    SELECT model_id, COUNT(*)::int AS count
    FROM model_images
    WHERE model_id = ANY(${modelIds})
    GROUP BY model_id
  `;
  return result.map(row => ({
    modelId: row.model_id,
    count: Number(row.count),
  }));
}

export async function getImagesByIds(imageIds) {
  if (!imageIds || imageIds.length === 0) return [];
  return db.select().from(modelImages).where(inArray(modelImages.id, imageIds));
}

export async function setModelImagePrimary(modelId, imageId) {
  await db.update(modelImages).set({ isPrimary: false }).where(eq(modelImages.modelId, modelId));
  const [row] = await db.update(modelImages)
    .set({ isPrimary: true })
    .where(eq(modelImages.id, imageId))
    .returning();

  if (row) {
    await db.update(models).set({ avatarUrl: row.gcsUrl }).where(eq(models.id, modelId));
  }

  return row || null;
}

export async function deleteModelImage(id) {
  const image = await getModelImage(id);
  if (image?.isPrimary) {
    const [other] = await db.select().from(modelImages)
      .where(eq(modelImages.modelId, image.modelId))
      .limit(1);
    if (other && other.id !== id) {
      await setModelImagePrimary(image.modelId, other.id);
    } else {
      await db.update(models).set({ avatarUrl: null }).where(eq(models.id, image.modelId));
    }
  }
  await db.delete(modelImages).where(eq(modelImages.id, id));
}
