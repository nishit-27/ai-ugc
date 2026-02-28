#!/usr/bin/env node

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Storage } from '@google-cloud/storage';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// ─── Config ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TABLE_FILTER = args.find(a => a.startsWith('--table='))?.split('=')[1] || null;
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '20', 10);
const DB_BATCH_SIZE = 50; // Batch DB updates

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const sql = neon(process.env.DATABASE_URL);

// R2 S3 client
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// GCS setup
let gcsStorageOptions = {};
if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
  try {
    const credentials = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY);
    gcsStorageOptions = { projectId: credentials.project_id, credentials };
  } catch (e) {
    console.error('Failed to parse GCS_SERVICE_ACCOUNT_KEY:', e.message);
    process.exit(1);
  }
}
const gcs = new Storage(gcsStorageOptions);

// ─── Helpers ────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const globalStats = { downloaded: 0, uploaded: 0, compressed: 0, dbUpdated: 0, failed: 0, savedBytes: 0 };

function getExt(url) {
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf('.');
    return dot >= 0 ? pathname.slice(dot).toLowerCase().split('?')[0] : '';
  } catch {
    return '';
  }
}

function parseGcsUrl(url) {
  const clean = url.split('?')[0];
  const prefixes = [
    'https://storage.googleapis.com/',
    'https://storage.cloud.google.com/',
  ];
  for (const prefix of prefixes) {
    if (clean.startsWith(prefix)) {
      const rest = clean.slice(prefix.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx > 0) {
        return { bucket: rest.slice(0, slashIdx), key: rest.slice(slashIdx + 1) };
      }
    }
  }
  return null;
}

function r2PublicUrl(key) {
  return `${R2_PUBLIC_URL}/${key}`;
}

function getContentType(ext) {
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

async function downloadFromGcs(gcsUrl) {
  const parsed = parseGcsUrl(gcsUrl);
  if (!parsed) throw new Error(`Cannot parse GCS URL: ${gcsUrl}`);
  const bucket = gcs.bucket(parsed.bucket);
  const file = bucket.file(parsed.key);
  const [buffer] = await file.download();
  globalStats.downloaded++;
  return buffer;
}

async function compressImage(buffer, ext) {
  try {
    if (ext === '.gif' || buffer.length < 5000) {
      return { buffer, ext, contentType: getContentType(ext) };
    }
    const img = sharp(buffer);
    const metadata = await img.metadata();
    let pipeline = img;
    if (metadata.width && metadata.width > 4096) {
      pipeline = pipeline.resize({ width: 4096, withoutEnlargement: true });
    }
    const webpBuffer = await pipeline.webp({ quality: 90, effort: 4 }).toBuffer();
    if (webpBuffer.length < buffer.length) {
      globalStats.compressed++;
      globalStats.savedBytes += buffer.length - webpBuffer.length;
      return { buffer: webpBuffer, ext: '.webp', contentType: 'image/webp' };
    }
    return { buffer, ext, contentType: getContentType(ext) };
  } catch {
    return { buffer, ext, contentType: getContentType(ext) };
  }
}

async function uploadToR2(r2Key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: r2Key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));
  globalStats.uploaded++;
}

async function migrateUrl(gcsUrl) {
  if (!gcsUrl || !gcsUrl.includes('storage.googleapis.com')) return null;

  const parsed = parseGcsUrl(gcsUrl);
  if (!parsed) return null;

  const r2Key = parsed.key;
  const ext = getExt(gcsUrl);
  const isImage = IMAGE_EXTS.has(ext);

  try {
    const originalBuffer = await downloadFromGcs(gcsUrl);

    let finalKey = r2Key;
    let finalBuffer = originalBuffer;
    let contentType = getContentType(ext);

    if (isImage) {
      const compressed = await compressImage(originalBuffer, ext);
      finalBuffer = compressed.buffer;
      contentType = compressed.contentType;
      if (compressed.ext !== ext) {
        finalKey = r2Key.replace(/\.[^.]+$/, compressed.ext);
      }
    }

    await uploadToR2(finalKey, finalBuffer, contentType);
    return r2PublicUrl(finalKey);
  } catch (err) {
    console.error(`  FAIL [${gcsUrl.slice(0, 80)}]: ${err.message}`);
    globalStats.failed++;
    return null;
  }
}

// Concurrency limiter
function createPool(concurrency) {
  let active = 0;
  const queue = [];

  function next() {
    if (queue.length === 0 || active >= concurrency) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  }

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

// ─── Table migration definitions ────────────────────────────────────────────

const TABLE_CONFIGS = [
  {
    name: 'media_files',
    selectQuery: () => sql`SELECT id, gcs_url FROM media_files WHERE gcs_url LIKE '%storage.googleapis.com%'`,
    batchUpdateSql: (ids, urls) => {
      const cases = ids.map((id, i) => `WHEN ${id} THEN '${urls[i].replace(/'/g, "''")}'`).join(' ');
      return sql`UPDATE media_files SET gcs_url = CASE id ${sql.unsafe(cases)} END WHERE id = ANY(${ids})`;
    },
    updateFn: (id, newUrl) => sql`UPDATE media_files SET gcs_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'gcs_url',
  },
  {
    name: 'model_images',
    selectQuery: () => sql`SELECT id, gcs_url FROM model_images WHERE gcs_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE model_images SET gcs_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'gcs_url',
  },
  {
    name: 'generated_images',
    selectQuery: () => sql`SELECT id, gcs_url FROM generated_images WHERE gcs_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE generated_images SET gcs_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'gcs_url',
  },
  {
    name: 'jobs_output',
    selectQuery: () => sql`SELECT id, output_url FROM jobs WHERE output_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE jobs SET output_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'output_url',
  },
  {
    name: 'jobs_image',
    selectQuery: () => sql`SELECT id, image_url FROM jobs WHERE image_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE jobs SET image_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'image_url',
  },
  {
    name: 'template_jobs_output',
    selectQuery: () => sql`SELECT id, output_url FROM template_jobs WHERE output_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE template_jobs SET output_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'output_url',
  },
  {
    name: 'template_jobs_video',
    selectQuery: () => sql`SELECT id, video_url FROM template_jobs WHERE video_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE template_jobs SET video_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'video_url',
  },
  {
    name: 'music_tracks',
    selectQuery: () => sql`SELECT id, gcs_url FROM music_tracks WHERE gcs_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE music_tracks SET gcs_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'gcs_url',
  },
  {
    name: 'models',
    selectQuery: () => sql`SELECT id, avatar_url FROM models WHERE avatar_url LIKE '%storage.googleapis.com%'`,
    updateFn: (id, newUrl) => sql`UPDATE models SET avatar_url = ${newUrl} WHERE id = ${id}`,
    urlField: 'avatar_url',
  },
];

// ─── JSONB migration for step_results ────────────────────────────────────────

async function migrateStepResults() {
  console.log('\n━━━ template_jobs_step_results (JSONB) ━━━');
  const rows = await sql`SELECT id, step_results FROM template_jobs WHERE step_results::text LIKE '%storage.googleapis.com%'`;
  console.log(`  ${rows.length} rows with GCS URLs in step_results`);

  if (rows.length === 0 || DRY_RUN) return;

  let updated = 0;
  const pool = createPool(10);

  await Promise.all(
    rows.map(row =>
      pool(async () => {
        try {
          const sr = typeof row.step_results === 'string' ? JSON.parse(row.step_results) : row.step_results;
          if (!Array.isArray(sr)) return;

          let changed = false;
          const fixed = sr.map(step => {
            const s = { ...step };
            if (s.outputUrl && s.outputUrl.includes('storage.googleapis.com')) {
              const parsed = parseGcsUrl(s.outputUrl);
              if (parsed) { s.outputUrl = r2PublicUrl(parsed.key); changed = true; }
            }
            if (Array.isArray(s.outputUrls)) {
              s.outputUrls = s.outputUrls.map(u => {
                if (u && u.includes('storage.googleapis.com')) {
                  const p = parseGcsUrl(u);
                  if (p) { changed = true; return r2PublicUrl(p.key); }
                }
                return u;
              });
            }
            return s;
          });

          if (changed) {
            await sql`UPDATE template_jobs SET step_results = ${JSON.stringify(fixed)}::jsonb WHERE id = ${row.id}`;
            updated++;
            globalStats.dbUpdated++;
          }
        } catch (err) {
          console.error(`  FAIL step_results row ${row.id}: ${err.message}`);
          globalStats.failed++;
        }
      })
    )
  );

  console.log(`  [template_jobs_step_results] Updated: ${updated}/${rows.length} rows`);
}

// ─── Batch DB updates (parallel batches of 50) ─────────────────────────────

async function batchUpdateDb(config, rows, urlToNewUrl) {
  const updates = [];
  for (const row of rows) {
    const oldUrl = row[config.urlField];
    const newUrl = urlToNewUrl.get(oldUrl);
    if (newUrl) {
      updates.push({ id: row.id, newUrl });
    }
  }

  if (updates.length === 0) return 0;

  // Process in parallel batches of DB_BATCH_SIZE
  const batches = [];
  for (let i = 0; i < updates.length; i += DB_BATCH_SIZE) {
    batches.push(updates.slice(i, i + DB_BATCH_SIZE));
  }

  let completed = 0;
  const dbPool = createPool(10); // 10 concurrent DB batches

  await Promise.all(
    batches.map(batch =>
      dbPool(async () => {
        // Run batch of individual updates in parallel
        await Promise.all(
          batch.map(({ id, newUrl }) => config.updateFn(id, newUrl))
        );
        completed += batch.length;
        globalStats.dbUpdated += batch.length;
      })
    )
  );

  return completed;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function migrateTable(config) {
  console.log(`\n━━━ ${config.name} ━━━`);
  const rows = await config.selectQuery();
  console.log(`  ${rows.length} rows with GCS URLs`);

  if (rows.length === 0 || DRY_RUN) return;

  const pool = createPool(CONCURRENCY);
  let processed = 0;

  const urlToNewUrl = new Map();
  const uniqueUrls = [...new Set(rows.map(r => r[config.urlField]).filter(Boolean))];
  console.log(`  ${uniqueUrls.length} unique URLs to transfer`);

  // Migrate unique URLs (parallel file transfers)
  await Promise.all(
    uniqueUrls.map(gcsUrl =>
      pool(async () => {
        const newUrl = await migrateUrl(gcsUrl);
        if (newUrl) urlToNewUrl.set(gcsUrl, newUrl);
        processed++;
        if (processed % 50 === 0 || processed === uniqueUrls.length) {
          const pct = ((processed / uniqueUrls.length) * 100).toFixed(1);
          console.log(`  [${config.name}] ${processed}/${uniqueUrls.length} (${pct}%) | up: ${globalStats.uploaded} | fail: ${globalStats.failed}`);
        }
      })
    )
  );

  // Batch DB updates (parallel!)
  console.log(`  [${config.name}] Updating ${rows.length} DB rows in parallel batches...`);
  const dbUpdated = await batchUpdateDb(config, rows, urlToNewUrl);
  console.log(`  [${config.name}] DB updated: ${dbUpdated}/${rows.length} rows`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   GCS → R2 Migration (FAST PARALLEL)            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Mode:           ${DRY_RUN ? 'DRY RUN' : 'FULL MIGRATION'}`);
  console.log(`  File concurrency: ${CONCURRENCY}`);
  console.log(`  DB batch size:    ${DB_BATCH_SIZE} (10 batches parallel)`);
  console.log(`  R2 Bucket:        ${BUCKET_NAME}`);
  if (TABLE_FILTER) console.log(`  Table filter:     ${TABLE_FILTER}`);
  console.log('');

  const required = ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'DATABASE_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`ERROR: Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('  Env vars: OK\n');

  const startTime = Date.now();

  const tables = TABLE_FILTER
    ? TABLE_CONFIGS.filter(t => t.name.startsWith(TABLE_FILTER))
    : TABLE_CONFIGS;

  if (tables.length === 0) {
    console.error(`No table matching "${TABLE_FILTER}"`);
    process.exit(1);
  }

  // Run ALL tables in parallel!
  await Promise.all(tables.map(config => migrateTable(config)));

  // Fix JSONB step_results URLs (text replacement only, no file transfer needed)
  if (!TABLE_FILTER || TABLE_FILTER === 'template_jobs_step_results') {
    await migrateStepResults();
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const savedMB = (globalStats.savedBytes / 1024 / 1024).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Migration Complete                             ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Time:           ${elapsed} min`);
  console.log(`  Downloaded:     ${globalStats.downloaded} files`);
  console.log(`  Uploaded to R2: ${globalStats.uploaded} files`);
  console.log(`  Compressed:     ${globalStats.compressed} images → saved ${savedMB} MB`);
  console.log(`  DB updated:     ${globalStats.dbUpdated} rows`);
  console.log(`  Failed:         ${globalStats.failed}`);
  console.log('');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
