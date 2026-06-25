import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repoRoot, resolveRepoPath } from './paths';

const execFileAsync = promisify(execFile);

const BLOCKED = [
  /\brm\s+-rf\s+\//,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bcurl\b.*\|\s*(ba)?sh\b/,
  /\bwget\b.*\|\s*(ba)?sh\b/,
  />\s*\/dev\//,
];

export async function shellRun(args: { command: string; cwd?: string }) {
  const command = args.command.trim();
  if (!command) throw new Error('command is required');
  for (const pattern of BLOCKED) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked by safety policy: ${command}`);
    }
  }

  const cwd = args.cwd ? resolveRepoPath(args.cwd) : repoRoot();
  const { stdout, stderr } = await execFileAsync('/bin/zsh', ['-lc', command], {
    cwd,
    timeout: Number(process.env.AXPLANE_SHELL_TIMEOUT_MS ?? 30_000),
    maxBuffer: 512_000,
    env: { ...process.env, PATH: process.env.PATH ?? '/usr/bin:/bin' },
  });

  return {
    ok: true,
    command,
    cwd,
    stdout: stdout.slice(0, 32_000),
    stderr: stderr.slice(0, 8_000),
  };
}
