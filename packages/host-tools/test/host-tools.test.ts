import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { docsSearch } from '../src/docs';
import { resolveRepoPath } from '../src/paths';
import { repoReadFile, repoWriteFile } from '../src/repo';
import { shellRun } from '../src/shell';

const originalRepoRoot = process.env.AXPLANE_REPO_ROOT;
const originalDocsRoot = process.env.AXPLANE_DOCS_ROOT;

function withTempRepo(run: (root: string) => void | Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axplane-host-tools-'));
  process.env.AXPLANE_REPO_ROOT = root;
  delete process.env.AXPLANE_DOCS_ROOT;
  return Promise.resolve(run(root)).finally(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (originalRepoRoot === undefined) delete process.env.AXPLANE_REPO_ROOT;
    else process.env.AXPLANE_REPO_ROOT = originalRepoRoot;
    if (originalDocsRoot === undefined) delete process.env.AXPLANE_DOCS_ROOT;
    else process.env.AXPLANE_DOCS_ROOT = originalDocsRoot;
  });
}

afterEach(() => {
  if (originalRepoRoot === undefined) delete process.env.AXPLANE_REPO_ROOT;
  else process.env.AXPLANE_REPO_ROOT = originalRepoRoot;
  if (originalDocsRoot === undefined) delete process.env.AXPLANE_DOCS_ROOT;
  else process.env.AXPLANE_DOCS_ROOT = originalDocsRoot;
});

describe('resolveRepoPath', () => {
  it('rejects path traversal outside repo root', async () => {
    await withTempRepo((root) => {
      fs.writeFileSync(path.join(root, 'safe.txt'), 'ok');
      expect(() => resolveRepoPath('../outside.txt')).toThrow(/escapes repo root/);
    });
  });
});

describe('repo tools', () => {
  it('reads and writes within sandbox', async () => {
    await withTempRepo((root) => {
      fs.writeFileSync(path.join(root, 'README.md'), '# AxPlane test');
      const read = repoReadFile({ path: 'README.md' });
      expect(read.content).toContain('AxPlane test');

      repoWriteFile({ path: 'nested/out.txt', content: 'written' });
      expect(fs.readFileSync(path.join(root, 'nested/out.txt'), 'utf8')).toBe('written');
    });
  });
});

describe('docs.search', () => {
  it('searches markdown under docs root', async () => {
    await withTempRepo((root) => {
      const docsDir = path.join(root, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'architecture.md'), 'AxPlane control plane overview');
      const result = docsSearch({ query: 'control plane' });
      expect(result.matches.some((m) => m.path.endsWith('architecture.md'))).toBe(true);
    });
  });
});

describe('shell.run', () => {
  it('blocks dangerous commands', async () => {
    await withTempRepo(async () => {
      await expect(shellRun({ command: 'sudo rm -rf /' })).rejects.toThrow(/blocked by safety policy/);
    });
  });

  it('runs safe commands in repo cwd', async () => {
    await withTempRepo(async (root) => {
      const result = await shellRun({ command: 'echo hello-axplane' });
      expect(result.stdout.trim()).toBe('hello-axplane');
      expect(result.cwd).toBe(root);
    });
  });
});
