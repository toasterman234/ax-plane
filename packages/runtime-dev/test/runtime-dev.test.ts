import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireWorkerLock,
  readWorkerHealth,
  releaseWorkerLock,
  writeWorkerHeartbeat,
} from '../src/index';

function tempRuntimeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'axplane-runtime-'));
}

describe('@axplane/runtime-dev', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('acquires and releases a worker lock', () => {
    const dir = tempRuntimeDir();
    dirs.push(dir);
    const lock = acquireWorkerLock(dir);
    expect(lock.pid).toBe(process.pid);
    releaseWorkerLock(dir);
    expect(fs.existsSync(path.join(dir, 'worker.lock'))).toBe(false);
  });

  it('reports healthy worker from heartbeat', () => {
    const dir = tempRuntimeDir();
    dirs.push(dir);
    writeWorkerHeartbeat({ mode: 'mock' }, dir);
    const health = readWorkerHealth(10_000, dir);
    expect(health.ok).toBe(true);
    expect(health.mode).toBe('mock');
  });
});
