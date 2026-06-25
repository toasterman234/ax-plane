import fs from 'node:fs';
import path from 'node:path';

export type WorkerLock = { pid: number; startedAt: string };
export type WorkerHeartbeat = { pid: number; lastTickAt: string; mode: string };
export type WorkerHealth = {
  ok: boolean;
  pid?: number;
  lastTickAt?: string;
  mode?: string;
  stale?: boolean;
  message?: string;
};

const DEFAULT_STALE_MS = 10_000;

export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start);
}

export function getRuntimeDir(root = findRepoRoot()): string {
  const configured = process.env.AXPLANE_RUNTIME_DIR;
  return configured ? path.resolve(configured) : path.join(root, '.axplane');
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export class WorkerAlreadyRunningError extends Error {
  constructor(public existing: WorkerLock) {
    super(
      `Another AxPlane worker is already running (pid ${existing.pid}, started ${existing.startedAt}). ` +
        'Kill it with: pkill -f "axplane/apps/worker" then restart pnpm dev.',
    );
    this.name = 'WorkerAlreadyRunningError';
  }
}

export function acquireWorkerLock(runtimeDir = getRuntimeDir()): WorkerLock {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const lockPath = path.join(runtimeDir, 'worker.lock');

  const existing = readJsonFile<WorkerLock>(lockPath);
  if (existing && isPidAlive(existing.pid)) {
    throw new WorkerAlreadyRunningError(existing);
  }
  if (existing) {
    fs.rmSync(lockPath, { force: true });
  }

  const lock: WorkerLock = { pid: process.pid, startedAt: new Date().toISOString() };
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  return lock;
}

export function releaseWorkerLock(runtimeDir = getRuntimeDir()): void {
  const lockPath = path.join(runtimeDir, 'worker.lock');
  const existing = readJsonFile<WorkerLock>(lockPath);
  if (existing?.pid === process.pid) {
    fs.rmSync(lockPath, { force: true });
  }
}

export function writeWorkerHeartbeat(
  input: { mode: string },
  runtimeDir = getRuntimeDir(),
): WorkerHeartbeat {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const heartbeat: WorkerHeartbeat = {
    pid: process.pid,
    lastTickAt: new Date().toISOString(),
    mode: input.mode,
  };
  fs.writeFileSync(path.join(runtimeDir, 'worker-heartbeat.json'), JSON.stringify(heartbeat, null, 2));
  return heartbeat;
}

export function readWorkerHealth(
  staleAfterMs = DEFAULT_STALE_MS,
  runtimeDir = getRuntimeDir(),
): WorkerHealth {
  const heartbeat = readJsonFile<WorkerHeartbeat>(path.join(runtimeDir, 'worker-heartbeat.json'));
  if (!heartbeat) {
    return { ok: false, message: 'No worker heartbeat found. Is pnpm dev:worker running?' };
  }

  const ageMs = Date.now() - new Date(heartbeat.lastTickAt).getTime();
  const alive = isPidAlive(heartbeat.pid);
  const stale = ageMs > staleAfterMs;

  if (!alive) {
    return {
      ok: false,
      pid: heartbeat.pid,
      lastTickAt: heartbeat.lastTickAt,
      mode: heartbeat.mode,
      stale: true,
      message: `Worker pid ${heartbeat.pid} is not running (last tick ${heartbeat.lastTickAt}).`,
    };
  }

  if (stale) {
    return {
      ok: false,
      pid: heartbeat.pid,
      lastTickAt: heartbeat.lastTickAt,
      mode: heartbeat.mode,
      stale: true,
      message: `Worker heartbeat is stale (${Math.round(ageMs / 1000)}s old).`,
    };
  }

  return {
    ok: true,
    pid: heartbeat.pid,
    lastTickAt: heartbeat.lastTickAt,
    mode: heartbeat.mode,
  };
}

export function registerWorkerShutdown(runtimeDir = getRuntimeDir()): void {
  const cleanup = () => releaseWorkerLock(runtimeDir);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.once('exit', cleanup);
}
