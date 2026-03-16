import { eq, and, gte, desc, asc, count } from 'drizzle-orm';
import { db } from './drizzle';
import { generatedImages } from './schema';

export async function createGeneratedImage({ gcsUrl, filename, modelImageUrl, sceneImageUrl, promptVariant, createdBy, modelId }) {
  const result = await db.insert(generatedImages).values({
    gcsUrl,
    filename,
    modelImageUrl: modelImageUrl || null,
    sceneImageUrl: sceneImageUrl || null,
    promptVariant: promptVariant || null,
    createdBy: createdBy || null,
    modelId: modelId || null,
  }).returning();
  return result[0];
}

export async function getGeneratedImage(id) {
  const result = await db.select().from(generatedImages).where(eq(generatedImages.id, id));
  return result[0] || null;
}

export async function getAllGeneratedImages() {
  return db.select().from(generatedImages).orderBy(desc(generatedImages.createdAt));
}

function buildWhereConditions(options = {}) {
  const { modelId, createdAfter } = options;
  const conditions = [];
  if (modelId) conditions.push(eq(generatedImages.modelId, modelId));
  if (createdAfter) conditions.push(gte(generatedImages.createdAt, new Date(createdAfter)));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getGeneratedImagesPage(limit, offset, options = {}) {
  const { sort = 'desc' } = options;
  const where = buildWhereConditions(options);
  const orderBy = sort === 'asc' ? asc(generatedImages.createdAt) : desc(generatedImages.createdAt);

  const [rows, countResult] = await Promise.all([
    db.select().from(generatedImages).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(generatedImages).where(where),
  ]);

  return { images: rows, total: countResult[0]?.total || 0 };
}

export async function getGeneratedImagesCount(options = {}) {
  const where = buildWhereConditions(options);
  const result = await db.select({ total: count() }).from(generatedImages).where(where);
  return result[0]?.total || 0;
}

export async function getGeneratedImagesByModelId(modelId) {
  return db.select().from(generatedImages).where(eq(generatedImages.modelId, modelId)).orderBy(desc(generatedImages.createdAt));
}

export async function deleteGeneratedImage(id) {
  await db.delete(generatedImages).where(eq(generatedImages.id, id));
}
