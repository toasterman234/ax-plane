import fs from 'node:fs';
import path from 'node:path';

export function repoRoot(): string {
  return process.env.AXPLANE_REPO_ROOT ?? process.cwd();
}

export function docsRoot(): string {
  return process.env.AXPLANE_DOCS_ROOT ?? path.join(repoRoot(), 'docs');
}

export function resolveRepoPath(relativePath: string): string {
  const root = path.resolve(repoRoot());
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path escapes repo root: ${relativePath}`);
  }
  return target;
}

export function assertRepoFile(relativePath: string): string {
  const target = resolveRepoPath(relativePath);
  if (!fs.existsSync(target)) throw new Error(`File not found: ${relativePath}`);
  if (!fs.statSync(target).isFile()) throw new Error(`Not a file: ${relativePath}`);
  return target;
}
