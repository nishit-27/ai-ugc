#!/usr/bin/env node

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Storage } from '@google-cloud/storage';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const sql = neon(process.env.DATABASE_URL);
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_PUBLIC_URL = 'https://pub-dc1f12839d7f4746bd2b2974c8455b3d.r2.dev';
const GCS_IMAGE_PREFIX = 'https://storage.googleapis.com/runable_staging_image/';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const credentials = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY);
const gcs = new Storage({ projectId: credentials.project_id, credentials });
const gcsBucket = gcs.bucket('runable_staging_image');

async function migrateImage(gcsUrl) {
  // Extract the key from the GCS URL
  const key = gcsUrl.replace(GCS_IMAGE_PREFIX, '');

  // Download from GCS
  const file = gcsBucket.file(key);
  const [buffer] = await file.download();

  // Compress to WebP
  let finalBuffer = buffer;
  let finalKey = key;
  let contentType = 'image/jpeg';

  try {
    const webpBuffer = await sharp(buffer)
      .resize({ width: 512, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    if (webpBuffer.length < buffer.length) {
      finalBuffer = webpBuffer;
      finalKey = key.replace(/\.[^.]+$/, '.webp');
      contentType = 'image/webp';
    }
  } catch {
    // Keep original if sharp fails
  }

  // Upload to R2
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: finalKey,
    Body: finalBuffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));

  return `${R2_PUBLIC_URL}/${finalKey}`;
}

async function main() {
  // 1. Collect all unique GCS model image URLs from pipeline_batches.master_config
  console.log('Finding GCS model image URLs in pipeline_batches...');
  const batches = await sql`
    SELECT id, master_config FROM pipeline_batches
    WHERE master_config::text LIKE ${'%storage.googleapis.com%'}
  `;
  console.log(`Found ${batches.length} batches with GCS URLs`);

  const urlSet = new Set();
  for (const b of batches) {
    const models = b.master_config?.models || [];
    for (const m of models) {
      if (m.primaryImageUrl?.includes('storage.googleapis.com')) {
        urlSet.add(m.primaryImageUrl);
      }
    }
  }

  // Also check generated_images.model_image_url and scene_image_url
  const genImages = await sql`
    SELECT DISTINCT model_image_url FROM generated_images
    WHERE model_image_url LIKE ${'%storage.googleapis.com%'}
    LIMIT 500
  `;
  for (const r of genImages) {
    if (r.model_image_url) urlSet.add(r.model_image_url);
  }
  const sceneImages = await sql`
    SELECT DISTINCT scene_image_url FROM generated_images
    WHERE scene_image_url LIKE ${'%storage.googleapis.com%'}
    LIMIT 500
  `;
  for (const r of sceneImages) {
    if (r.scene_image_url) urlSet.add(r.scene_image_url);
  }

  const uniqueUrls = [...urlSet];
  console.log(`Total unique GCS image URLs to migrate: ${uniqueUrls.length}`);

  // 2. Migrate each image
  const urlMap = new Map(); // old GCS URL -> new R2 URL
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < uniqueUrls.length; i += 5) {
    const batch = uniqueUrls.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (gcsUrl) => {
        const r2Url = await migrateImage(gcsUrl);
        urlMap.set(gcsUrl, r2Url);
      })
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') migrated++;
      else {
        failed++;
        console.error('  FAIL:', batch[j].slice(-50), results[j].reason?.message?.slice(0, 60));
      }
    }
    if ((migrated + failed) % 20 === 0 || migrated + failed === uniqueUrls.length) {
      console.log(`Images: ${migrated} migrated | ${failed} failed | ${migrated + failed}/${uniqueUrls.length}`);
    }
  }

  console.log(`\nImage migration done: ${migrated} ok, ${failed} failed`);

  // 3. Update pipeline_batches.master_config URLs
  console.log('\nUpdating pipeline_batches master_config...');
  let batchesUpdated = 0;
  for (const b of batches) {
    const mc = b.master_config;
    if (!mc?.models) continue;
    let changed = false;
    for (const m of mc.models) {
      const newUrl = urlMap.get(m.primaryImageUrl);
      if (newUrl) {
        m.primaryImageUrl = newUrl;
        changed = true;
      }
    }
    if (changed) {
      await sql`UPDATE pipeline_batches SET master_config = ${JSON.stringify(mc)}::jsonb WHERE id = ${b.id}`;
      batchesUpdated++;
    }
  }
  console.log(`Updated ${batchesUpdated} pipeline_batches`);

  // 4. Update generated_images URLs
  if (urlMap.size > 0) {
    console.log('\nUpdating generated_images...');
    for (const [oldUrl, newUrl] of urlMap) {
      await sql`UPDATE generated_images SET model_image_url = ${newUrl} WHERE model_image_url = ${oldUrl}`;
      await sql`UPDATE generated_images SET scene_image_url = ${newUrl} WHERE scene_image_url = ${oldUrl}`;
    }
    const remaining = await sql`
      SELECT COUNT(*)::int AS cnt FROM generated_images
      WHERE model_image_url LIKE ${'%storage.googleapis.com%'}
         OR scene_image_url LIKE ${'%storage.googleapis.com%'}
    `;
    console.log(`Remaining GCS URLs in generated_images: ${remaining[0].cnt}`);
  }

  console.log('\nAll done!');
}

main().catch((err) => { console.error('Failed:', err); process.exit(1); });
