#!/usr/bin/env node
// Pings every provider API key in .env and reports which work.
// Useful after rotating a key from a provider's admin console — paste
// the new value into .env, run this, and confirm green before
// restarting the dev server or deploying.
//
// Usage: node scripts/check-keys.mjs [--only=fal,openai]
//
// Returns non-zero exit if any selected check fails.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(ENV_PATH, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      let value = m[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      env[m[1]] = value;
    }
  } catch (err) {
    console.error(`failed to read .env at ${ENV_PATH}:`, err.message);
    process.exit(2);
  }
  return env;
}

// Each check returns { ok, detail }. `detail` is a short human string.
// Checks should be cheap (≤1 light request) and not consume credits.
const env = loadEnv();

async function checkFal() {
  const key = env.FAL_KEY;
  if (!key) return { ok: false, detail: 'missing' };
  const r = await fetch('https://queue.fal.run/me', {
    headers: { Authorization: `Key ${key}` },
  });
  if (r.status === 200) return { ok: true, detail: 'reachable' };
  if (r.status === 401 || r.status === 403) return { ok: false, detail: `unauthorized (${r.status})` };
  return { ok: false, detail: `HTTP ${r.status}` };
}

async function checkOpenAI() {
  const key = env.OPENAI_API_KEY;
  if (!key) return { ok: false, detail: 'missing' };
  const r = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.status === 200) return { ok: true, detail: 'reachable' };
  if (r.status === 401) return { ok: false, detail: 'unauthorized' };
  return { ok: false, detail: `HTTP ${r.status}` };
}

async function checkGemini() {
  const key = env.GEMINI_API_KEY;
  if (!key) return { ok: false, detail: 'missing' };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  if (r.status === 200) return { ok: true, detail: 'reachable' };
  if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, detail: `unauthorized (${r.status})` };
  return { ok: false, detail: `HTTP ${r.status}` };
}

async function checkYouTube() {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, detail: 'missing' };
  // Probe a cheap endpoint that doesn't burn quota meaningfully.
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`,
  );
  if (r.status === 200) return { ok: true, detail: 'reachable' };
  if (r.status === 400 || r.status === 403) return { ok: false, detail: `unauthorized (${r.status})` };
  return { ok: false, detail: `HTTP ${r.status}` };
}

async function checkRapidApi() {
  const key = env.RAPIDAPI_KEY;
  const host = env.RAPIDAPI_HOST_INSTAGRAM || 'instagram-looter2.p.rapidapi.com';
  if (!key) return { ok: false, detail: 'missing' };
  // HEAD on the host root — RapidAPI returns 403 if the key is wrong vs 404
  // if the path is unknown, both prove the key validation reached them.
  const r = await fetch(`https://${host}/`, {
    method: 'HEAD',
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host },
  });
  if (r.status === 401 || r.status === 403) return { ok: false, detail: `unauthorized (${r.status})` };
  return { ok: true, detail: `reachable (HTTP ${r.status})` };
}

async function checkLate() {
  const keys = (env.LATE_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.length === 0) return { ok: false, detail: 'missing' };
  const results = [];
  for (const [i, key] of keys.entries()) {
    const r = await fetch('https://getlate.dev/api/v1/profiles', {
      headers: { Authorization: `Bearer ${key}` },
    });
    results.push(`#${i}: HTTP ${r.status}`);
  }
  const allOk = results.every((s) => s.includes('200'));
  return { ok: allOk, detail: results.join(', ') };
}

async function checkDatabase() {
  const url = env.DATABASE_URL;
  if (!url) return { ok: false, detail: 'missing' };
  // Format check only — pinging the DB would need pg, which adds runtime
  // weight to a script that's meant to be one-shot.
  const m = url.match(/^postgres(ql)?:\/\//);
  return m ? { ok: true, detail: 'looks like a Postgres URL' } : { ok: false, detail: 'unexpected scheme' };
}

const CHECKS = [
  ['FAL_KEY',          checkFal],
  ['OPENAI_API_KEY',   checkOpenAI],
  ['GEMINI_API_KEY',   checkGemini],
  ['YOUTUBE_API_KEY',  checkYouTube],
  ['RAPIDAPI_KEY',     checkRapidApi],
  ['LATE_API_KEYS',    checkLate],
  ['DATABASE_URL',     checkDatabase],
];

// Cloudflare R2, Google OAuth, and GCS service-account keys aren't pinged
// here — R2 needs an SDK + bucket access, OAuth needs the full PKCE flow,
// and GCS service-account JSON validates by hitting GCS (heavy). Those
// are best verified by actually running the app.

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim().toLowerCase()) : null;

let anyFailed = false;
const results = [];

for (const [label, check] of CHECKS) {
  const shortName = label.toLowerCase().replace(/_api_key|_key|_keys/, '').replace(/_url/, '');
  if (only && !only.includes(shortName)) continue;
  try {
    const result = await check();
    const icon = result.ok ? '✓' : '✗';
    results.push(`${icon} ${label.padEnd(20)} ${result.detail}`);
    if (!result.ok) anyFailed = true;
  } catch (err) {
    results.push(`✗ ${label.padEnd(20)} ${err.message}`);
    anyFailed = true;
  }
}

console.log(results.join('\n'));
process.exit(anyFailed ? 1 : 0);
