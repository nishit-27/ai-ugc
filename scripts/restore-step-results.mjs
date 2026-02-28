#!/usr/bin/env node

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Storage } from '@google-cloud/storage';

const sql = neon(process.env.DATABASE_URL);
const R2_PUBLIC_URL = 'https://pub-dc1f12839d7f4746bd2b2974c8455b3d.r2.dev';

const credentials = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY);
const gcs = new Storage({ projectId: credentials.project_id, credentials });
const gcsBucket = gcs.bucket('runable_staging_files');

async function main() {
  // Get GCS files grouped by template job ID
  console.log('Listing GCS video files...');
  const [gcsFiles] = await gcsBucket.getFiles({ prefix: 'ai-ugc/videos/template-' });

  // Build map: jobId -> [file keys]
  const jobFiles = new Map();
  for (const f of gcsFiles) {
    const match = f.name.match(/template-([0-9a-f-]{36})/);
    if (!match) continue;
    const jobId = match[1];
    if (!jobFiles.has(jobId)) jobFiles.set(jobId, []);
    jobFiles.get(jobId).push(f.name);
  }
  console.log('Jobs with GCS files:', jobFiles.size);

  // Get all completed template_jobs
  const jobs = await sql`
    SELECT id, step_results
    FROM template_jobs
    WHERE status = 'completed'
  `;
  console.log('Completed template jobs:', jobs.length);

  let needsRestore = 0;
  let restored = 0;

  for (const job of jobs) {
    const gcsKeys = jobFiles.get(job.id);
    if (!gcsKeys || gcsKeys.length === 0) continue;

    const currentSteps = Array.isArray(job.step_results) ? job.step_results : [];
    const currentUrls = new Set(currentSteps.map(s => s.outputUrl).filter(Boolean));

    // Find GCS files not represented in current step_results
    const missingKeys = gcsKeys.filter(key => {
      const r2Url = `${R2_PUBLIC_URL}/${key}`;
      return !currentUrls.has(r2Url);
    });

    if (missingKeys.length === 0) continue;
    needsRestore++;

    // Rebuild step_results entries for missing files
    const newSteps = [...currentSteps];
    for (const key of missingKeys) {
      const r2Url = `${R2_PUBLIC_URL}/${key}`;
      const stepMatch = key.match(/step-(\d+)\.mp4$/);
      const isRecovered = key.includes('-recovered.');

      newSteps.push({
        type: 'video-generation',
        label: isRecovered ? 'Recovered video' : 'Generated video',
        stepId: `restored-${stepMatch ? stepMatch[1] : '0'}`,
        outputUrl: r2Url,
      });
    }

    // Sort by step number
    newSteps.sort((a, b) => {
      const aNum = parseInt((a.stepId || '').match(/\d+/)?.[0] || '0');
      const bNum = parseInt((b.stepId || '').match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });

    await sql`UPDATE template_jobs SET step_results = ${JSON.stringify(newSteps)}::jsonb WHERE id = ${job.id}`;
    restored++;
    if (restored % 100 === 0) console.log(`Restored ${restored}/${needsRestore}...`);
  }

  console.log(`\nDone! Restored step_results for ${restored} jobs`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
