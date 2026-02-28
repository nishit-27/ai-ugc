import { sql } from './db-client';
import { transformGeneratedImage } from './db-transforms';

export async function createGeneratedImage({ gcsUrl, filename, modelImageUrl, sceneImageUrl, promptVariant, createdBy, modelId }) {
  const result = await sql`
    INSERT INTO generated_images (gcs_url, filename, model_image_url, scene_image_url, prompt_variant, created_by, model_id)
    VALUES (${gcsUrl}, ${filename}, ${modelImageUrl || null}, ${sceneImageUrl || null}, ${promptVariant || null}, ${createdBy || null}, ${modelId || null})
    RETURNING *
  `;
  return transformGeneratedImage(result[0]);
}

export async function getGeneratedImage(id) {
  const result = await sql`SELECT * FROM generated_images WHERE id = ${id}`;
  return result[0] ? transformGeneratedImage(result[0]) : null;
}

export async function getAllGeneratedImages() {
  const result = await sql`SELECT * FROM generated_images ORDER BY created_at DESC`;
  return result.map(transformGeneratedImage);
}

function normalizeSort(sort = 'desc') {
  return sort === 'asc' ? 'asc' : 'desc';
}

async function getGeneratedImagesRows(limit, offset, filters = {}) {
  const { modelId = null, createdAfter = null, sort = 'desc' } = filters;
  const direction = normalizeSort(sort);

  if (direction === 'asc') {
    if (modelId && createdAfter) {
      return sql`
        SELECT * FROM generated_images
        WHERE model_id = ${modelId} AND created_at >= ${createdAfter}
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    if (modelId) {
      return sql`
        SELECT * FROM generated_images
        WHERE model_id = ${modelId}
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    if (createdAfter) {
      return sql`
        SELECT * FROM generated_images
        WHERE created_at >= ${createdAfter}
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return sql`SELECT * FROM generated_images ORDER BY created_at ASC LIMIT ${limit} OFFSET ${offset}`;
  }

  if (modelId && createdAfter) {
    return sql`
      SELECT * FROM generated_images
      WHERE model_id = ${modelId} AND created_at >= ${createdAfter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  if (modelId) {
    return sql`
      SELECT * FROM generated_images
      WHERE model_id = ${modelId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  if (createdAfter) {
    return sql`
      SELECT * FROM generated_images
      WHERE created_at >= ${createdAfter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return sql`SELECT * FROM generated_images ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
}

async function getGeneratedImagesCountRows(filters = {}) {
  const { modelId = null, createdAfter = null } = filters;

  if (modelId && createdAfter) {
    return sql`
      SELECT COUNT(*)::int AS total FROM generated_images
      WHERE model_id = ${modelId} AND created_at >= ${createdAfter}
    `;
  }
  if (modelId) {
    return sql`
      SELECT COUNT(*)::int AS total FROM generated_images
      WHERE model_id = ${modelId}
    `;
  }
  if (createdAfter) {
    return sql`
      SELECT COUNT(*)::int AS total FROM generated_images
      WHERE created_at >= ${createdAfter}
    `;
  }
  return sql`SELECT COUNT(*)::int AS total FROM generated_images`;
}

export async function getGeneratedImagesPage(limit, offset, options = {}) {
  const {
    modelId = null,
    createdAfter = null,
    sort = 'desc',
  } = options;

  // Always run data + count in parallel (never serial).
  const [rows, countResult] = await Promise.all([
    getGeneratedImagesRows(limit, offset, { modelId, createdAfter, sort }),
    getGeneratedImagesCountRows({ modelId, createdAfter }),
  ]);

  return { images: rows.map(transformGeneratedImage), total: countResult[0].total };
}

export async function getGeneratedImagesCount(options = {}) {
  const { modelId = null, createdAfter = null } = options;
  const result = await getGeneratedImagesCountRows({ modelId, createdAfter });
  return result[0]?.total || 0;
}

export async function getGeneratedImagesByModelId(modelId) {
  const result = await sql`SELECT * FROM generated_images WHERE model_id = ${modelId} ORDER BY created_at DESC`;
  return result.map(transformGeneratedImage);
}

export async function deleteGeneratedImage(id) {
  await sql`DELETE FROM generated_images WHERE id = ${id}`;
}
