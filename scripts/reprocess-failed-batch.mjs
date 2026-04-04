import { neon } from '@neondatabase/serverless';

function printUsage() {
  console.log(`Usage:
  node --env-file=.env scripts/reprocess-failed-batch.mjs <batch-id-or-url> [--origin https://runable.win] [--all-failed] [--dry-run]

Defaults:
  - Retries only failed jobs whose error contains ENOSPC / "no space left on device"
  - Sends POST requests to /api/templates/:id/process on the provided origin
`);
}

function parseArgs(argv) {
  const args = {
    input: null,
    origin: process.env.APP_URL || 'https://runable.win',
    allFailed: false,
    dryRun: false,
    match: null,
    retryableNetwork: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (!args.input && !arg.startsWith('--')) {
      args.input = arg;
      continue;
    }
    if (arg === '--all-failed') {
      args.allFailed = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--retryable-network') {
      args.retryableNetwork = true;
      continue;
    }
    if (arg === '--match') {
      args.match = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--origin') {
      args.origin = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) {
    printUsage();
    process.exit(1);
  }

  return args;
}

function normalizeBatchId(input) {
  try {
    const url = new URL(input);
    const parts = url.pathname.split('/').filter(Boolean);
    const batchId = parts[parts.length - 1];
    if (!batchId) {
      throw new Error(`Could not extract batch ID from URL: ${input}`);
    }
    return { batchId, origin: url.origin };
  } catch {
    return { batchId: input, origin: null };
  }
}

function isRetryableNetworkError(error) {
  return /(fetch failed|network|socket|other side closed|und_err|econnreset|etimedout|timed out|timeout|eai_again|enotfound|connection reset|connection terminated|service unavailable|bad gateway|gateway timeout|too many requests|rate limit)/i.test(error || '');
}

function shouldRetryJob(job, options) {
  if (job.status !== 'failed') return false;
  if (options.allFailed) return true;
  if (options.match) return new RegExp(options.match, 'i').test(job.error || '');
  if (options.retryableNetwork) return isRetryableNetworkError(job.error || '');
  return /(ENOSPC|no space left on device)/i.test(job.error || '');
}

async function triggerJob(origin, job) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${origin.replace(/\/$/, '')}/api/templates/${job.id}/process`, {
      method: 'POST',
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const args = parseArgs(process.argv.slice(2));
  const parsed = normalizeBatchId(args.input);
  const batchId = parsed.batchId;
  const origin = parsed.origin || args.origin;

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, name, status, current_step, total_steps, error, created_at
    FROM template_jobs
    WHERE pipeline_batch_id = ${batchId}
    ORDER BY created_at ASC
  `;

  const failedJobs = rows.filter((row) => row.status === 'failed');
  const targetJobs = rows.filter((row) => shouldRetryJob(row, args));

  console.log(JSON.stringify({
    batchId,
    origin,
    totalJobs: rows.length,
    failedJobs: failedJobs.length,
    targetedJobs: targetJobs.length,
    filter: args.allFailed
      ? 'all failed jobs'
      : args.match
        ? `error matches /${args.match}/i`
        : args.retryableNetwork
          ? 'retryable network failures'
          : 'ENOSPC/no-space failures',
    targets: targetJobs.map((job) => ({
      id: job.id,
      name: job.name,
      currentStep: job.current_step,
      totalSteps: job.total_steps,
      error: job.error,
    })),
  }, null, 2));

  if (args.dryRun || targetJobs.length === 0) {
    return;
  }

  const concurrency = 4;
  let nextIndex = 0;
  const results = [];

  async function worker() {
    while (nextIndex < targetJobs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const job = targetJobs[currentIndex];
      const result = await triggerJob(origin, job);
      results.push({ jobId: job.id, name: job.name, ...result });
      console.log(`${result.ok ? 'OK' : 'FAIL'} ${job.id} ${job.name} -> ${result.status}${result.body ? ` ${result.body}` : ''}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targetJobs.length) }, () => worker()));

  const succeeded = results.filter((row) => row.ok).length;
  const failed = results.length - succeeded;

  console.log(JSON.stringify({ batchId, triggered: succeeded, failed }, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
