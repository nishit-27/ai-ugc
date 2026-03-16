import { eq, desc } from 'drizzle-orm';
import { db } from './drizzle';
import { mediaFiles } from './schema';

export async function createMediaFile({ filename, originalName, fileType, gcsUrl, fileSize, mimeType, jobId }) {
  const result = await db.insert(mediaFiles).values({
    filename,
    originalName: originalName || null,
    fileType,
    gcsUrl,
    fileSize: fileSize || null,
    mimeType: mimeType || null,
    jobId: jobId || null,
  }).returning();
  return result[0];
}

export async function getMediaFile(id) {
  const result = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));
  return result[0] || null;
}

export async function getMediaFileByFilename(filename) {
  const result = await db.select().from(mediaFiles).where(eq(mediaFiles.filename, filename));
  return result[0] || null;
}

export async function getAllMediaFiles(fileType) {
  if (fileType) {
    return db.select().from(mediaFiles).where(eq(mediaFiles.fileType, fileType)).orderBy(desc(mediaFiles.createdAt));
  }
  return db.select().from(mediaFiles).orderBy(desc(mediaFiles.createdAt));
}

export async function deleteMediaFile(id) {
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
}
