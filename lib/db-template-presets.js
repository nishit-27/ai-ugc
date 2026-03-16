import { eq, desc, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { templatePresets } from './schema';

export async function createTemplatePreset({ name, description, pipeline }) {
  const result = await db.insert(templatePresets).values({
    name,
    description: description || null,
    pipeline,
  }).returning();
  return result[0];
}

export async function getAllTemplatePresets() {
  return await db.select().from(templatePresets).orderBy(desc(templatePresets.updatedAt));
}

export async function updateTemplatePreset(id, updates) {
  const { name, description, pipeline } = updates;
  const set = { updatedAt: sql`NOW()` };
  if (name) set.name = name;
  if (description !== undefined) set.description = description;
  if (pipeline) set.pipeline = pipeline;

  const result = await db.update(templatePresets).set(set).where(eq(templatePresets.id, id)).returning();
  return result[0] || null;
}

export async function deleteTemplatePreset(id) {
  await db.delete(templatePresets).where(eq(templatePresets.id, id));
}
