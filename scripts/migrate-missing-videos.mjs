#!/usr/bin/env node

import 'dotenv/config';
import { Storage } from '@google-cloud/storage';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

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
const gcsBucket = gcs.bucket('runable_staging_files');

async function fileExistsOnR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateFile(gcsKey, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const file = gcsBucket.file(gcsKey);
      const [buffer] = await file.download();
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: gcsKey,
        Body: buffer,
        ContentType: 'video/mp4',
        CacheControl: 'public, max-age=31536000',
      }));
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      // Wait before retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// Sequential batches (not full concurrency pool — avoids overwhelming network)
async function main() {
  console.log('Listing GCS files...');
  const [gcsFiles] = await gcsBucket.getFiles({ prefix: 'ai-ugc/videos/template-' });
  console.log('Total GCS files:', gcsFiles.length);

  // Check which are missing from R2 (50 concurrent HEAD checks — lightweight)
  const missing = [];
  let checked = 0;
  const CHECK_BATCH = 50;

  for (let i = 0; i < gcsFiles.length; i += CHECK_BATCH) {
    const batch = gcsFiles.slice(i, i + CHECK_BATCH);
    const results = await Promise.all(
      batch.map(async (f) => {
        const exists = await fileExistsOnR2(f.name);
        return { key: f.name, exists };
      })
    );
    for (const r of results) {
      if (!r.exists) missing.push(r.key);
    }
    checked += batch.length;
    if (checked % 200 === 0 || checked === gcsFiles.length) {
      console.log(`Checked ${checked}/${gcsFiles.length} | missing: ${missing.length}`);
    }
  }

  console.log(`\nMissing from R2: ${missing.length} files`);
  if (missing.length === 0) { console.log('All files present on R2!'); return; }

  // Migrate in batches of 5 (manageable for large video files)
  const UPLOAD_BATCH = 5;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i += UPLOAD_BATCH) {
    const batch = missing.slice(i, i + UPLOAD_BATCH);
    const results = await Promise.allSettled(
      batch.map((key) => migrateFile(key))
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        migrated++;
      } else {
        failed++;
        console.error('  FAIL:', batch[j].slice(-55), results[j].reason?.message?.slice(0, 60));
      }
    }
    const total = migrated + failed;
    if (total % 10 === 0 || total === missing.length) {
      console.log(`Progress: ${migrated} migrated | ${failed} failed | ${total}/${missing.length}`);
    }
  }

  console.log(`\nDone! Migrated: ${migrated}, Failed: ${failed}`);
}

main().catch((err) => { console.error('Failed:', err); process.exit(1); });
