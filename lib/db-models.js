import { db } from './drizzle';
import { models, modelGroupMemberships } from './schema';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { sql as rawSql } from './db-client';

export async function createModel({ name, description, groupName, avatarUrl }) {
  const [model] = await db.insert(models).values({
    name,
    description: description || null,
    groupName: groupName || null,
    avatarUrl: avatarUrl || null,
  }).returning();

  if (groupName) {
    await db.insert(modelGroupMemberships).values({
      modelId: model.id,
      groupName,
    }).onConflictDoNothing();
  }

  const memberships = await db.select({ groupName: modelGroupMemberships.groupName })
    .from(modelGroupMemberships)
    .where(eq(modelGroupMemberships.modelId, model.id))
    .orderBy(asc(modelGroupMemberships.groupName));

  return { ...model, groupNames: memberships.map(r => r.groupName) };
}

export async function getModel(id) {
  const [model] = await db.select().from(models).where(eq(models.id, id));
  if (!model) return null;

  const memberships = await db.select({ groupName: modelGroupMemberships.groupName })
    .from(modelGroupMemberships)
    .where(eq(modelGroupMemberships.modelId, id))
    .orderBy(asc(modelGroupMemberships.groupName));

  return { ...model, groupNames: memberships.map(r => r.groupName) };
}

export async function getAllModels() {
  const [allModels, allMemberships] = await Promise.all([
    db.select().from(models).orderBy(desc(models.createdAt)),
    db.select({ modelId: modelGroupMemberships.modelId, groupName: modelGroupMemberships.groupName })
      .from(modelGroupMemberships)
      .orderBy(asc(modelGroupMemberships.groupName)),
  ]);

  const membershipMap = new Map();
  for (const row of allMemberships) {
    const existing = membershipMap.get(row.modelId) || [];
    existing.push(row.groupName);
    membershipMap.set(row.modelId, existing);
  }

  return allModels.map(row => ({
    ...row,
    groupNames: membershipMap.get(row.id) || [],
  }));
}

export async function updateModel(id, updates) {
  const { name, description, avatarUrl } = updates;
  const set = {};
  if (name !== undefined) set.name = name || null;
  if (description !== undefined) set.description = description || null;
  if (avatarUrl !== undefined) set.avatarUrl = avatarUrl || null;

  if (Object.keys(set).length === 0) return getModel(id);

  const [model] = await db.update(models).set(set).where(eq(models.id, id)).returning();
  if (!model) return null;

  const memberships = await db.select({ groupName: modelGroupMemberships.groupName })
    .from(modelGroupMemberships)
    .where(eq(modelGroupMemberships.modelId, id))
    .orderBy(asc(modelGroupMemberships.groupName));

  return { ...model, groupNames: memberships.map(r => r.groupName) };
}

export async function deleteModel(id) {
  await db.delete(models).where(eq(models.id, id));
}

// ── Multi-group membership functions ──

export async function getModelGroups(modelId) {
  const result = await db.select({ groupName: modelGroupMemberships.groupName })
    .from(modelGroupMemberships)
    .where(eq(modelGroupMemberships.modelId, modelId))
    .orderBy(asc(modelGroupMemberships.groupName));
  return result.map(r => r.groupName);
}

export async function getAllModelGroupMemberships() {
  return db.select({
    modelId: modelGroupMemberships.modelId,
    groupName: modelGroupMemberships.groupName,
  }).from(modelGroupMemberships).orderBy(asc(modelGroupMemberships.groupName));
}

export async function setModelGroups(modelId, groupNames) {
  await db.delete(modelGroupMemberships).where(eq(modelGroupMemberships.modelId, modelId));
  if (groupNames && groupNames.length > 0) {
    for (const groupName of groupNames) {
      const trimmed = groupName.trim();
      if (!trimmed) continue;
      await db.insert(modelGroupMemberships).values({
        modelId,
        groupName: trimmed,
      }).onConflictDoNothing();
    }
  }
  const firstGroup = groupNames && groupNames.length > 0 ? groupNames[0].trim() : null;
  await db.update(models).set({ groupName: firstGroup }).where(eq(models.id, modelId));
}

export async function addModelToGroup(modelId, groupName) {
  await db.insert(modelGroupMemberships).values({ modelId, groupName }).onConflictDoNothing();
}

export async function removeModelFromGroup(modelId, groupName) {
  await db.delete(modelGroupMemberships).where(
    sql`${modelGroupMemberships.modelId} = ${modelId} AND ${modelGroupMemberships.groupName} = ${groupName}`
  );
}

export async function removeAllMembershipsForGroup(groupName) {
  await db.delete(modelGroupMemberships).where(
    sql`lower(${modelGroupMemberships.groupName}) = lower(${groupName})`
  );
}

export async function renameGroupMemberships(oldName, newName) {
  await db.update(modelGroupMemberships).set({ groupName: newName }).where(
    sql`lower(${modelGroupMemberships.groupName}) = lower(${oldName})`
  );
}

export async function updateModelsGroupName(oldName, newName) {
  await rawSql`
    UPDATE models
    SET group_name = ${newName}
    WHERE lower(btrim(group_name)) = lower(${oldName})
  `;
}

export async function clearModelsGroupName(groupName) {
  await rawSql`
    UPDATE models
    SET group_name = NULL
    WHERE lower(btrim(group_name)) = lower(${groupName})
  `;
}
