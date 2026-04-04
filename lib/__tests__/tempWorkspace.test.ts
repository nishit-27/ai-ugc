import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempWorkspace, createTempWorkspace, pruneStaleTempArtifacts } from '@/lib/tempWorkspace';

const workspacesToCleanup = new Set<string>();
const rootsToCleanup = new Set<string>();

afterEach(() => {
  for (const workspace of workspacesToCleanup) {
    cleanupTempWorkspace(workspace);
  }
  workspacesToCleanup.clear();

  for (const root of rootsToCleanup) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  rootsToCleanup.clear();
});

describe('tempWorkspace', () => {
  it('creates a dedicated workspace under the shared temp root', () => {
    const workspace = createTempWorkspace('Template Job');
    workspacesToCleanup.add(workspace);

    expect(path.basename(workspace)).toMatch(/^template-job-/);
    expect(path.dirname(workspace)).toBe(path.join(os.tmpdir(), 'ai-ugc-temp'));
    expect(fs.existsSync(workspace)).toBe(true);
  });

  it('prunes stale files and directories without touching fresh artifacts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-ugc-temp-test-'));
    rootsToCleanup.add(root);

    const staleFile = path.join(root, 'stale.mp4');
    const freshFile = path.join(root, 'fresh.mp4');
    const staleDir = path.join(root, 'stale-dir');
    const freshDir = path.join(root, 'fresh-dir');

    fs.writeFileSync(staleFile, 'stale');
    fs.writeFileSync(freshFile, 'fresh');
    fs.mkdirSync(staleDir);
    fs.mkdirSync(freshDir);
    fs.writeFileSync(path.join(staleDir, 'old.tmp'), 'old');
    fs.writeFileSync(path.join(freshDir, 'new.tmp'), 'new');

    const now = Date.now();
    const oldDate = new Date(now - 60_000);
    const freshDate = new Date(now - 1_000);

    fs.utimesSync(staleFile, oldDate, oldDate);
    fs.utimesSync(freshFile, freshDate, freshDate);
    fs.utimesSync(staleDir, oldDate, oldDate);
    fs.utimesSync(freshDir, freshDate, freshDate);

    pruneStaleTempArtifacts(root, 5_000, now);

    expect(fs.existsSync(staleFile)).toBe(false);
    expect(fs.existsSync(staleDir)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
    expect(fs.existsSync(freshDir)).toBe(true);
  });
});
