import fs from 'node:fs';
import path from 'node:path';
import { assertRepoFile, resolveRepoPath, repoRoot } from './paths';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '.drizzle']);

export function repoListFiles(args: { path?: string; maxEntries?: number }) {
  const base = resolveRepoPath(args.path ?? '.');
  const max = Math.min(args.maxEntries ?? 200, 500);
  const entries: string[] = [];

  function walk(dir: string, prefix: string) {
    if (entries.length >= max) return;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (entries.length >= max) break;
      if (SKIP_DIRS.has(item.name)) continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      entries.push(item.isDirectory() ? `${rel}/` : rel);
      if (item.isDirectory() && entries.length < max) {
        walk(path.join(dir, item.name), rel);
      }
    }
  }

  walk(base, args.path && args.path !== '.' ? args.path.replace(/\/$/, '') : '');
  return { root: repoRoot(), path: args.path ?? '.', entries };
}

export function repoReadFile(args: { path: string; maxChars?: number }) {
  const file = assertRepoFile(args.path);
  const max = Math.min(args.maxChars ?? 32_000, 128_000);
  const content = fs.readFileSync(file, 'utf8').slice(0, max);
  return { path: args.path, content, truncated: content.length >= max };
}

export function repoSearch(args: { query: string; path?: string; maxResults?: number }) {
  const base = resolveRepoPath(args.path ?? '.');
  const max = Math.min(args.maxResults ?? 30, 100);
  const needle = args.query.toLowerCase();
  const matches: Array<{ path: string; line: number; text: string }> = [];

  function walk(dir: string, prefix: string) {
    if (matches.length >= max) return;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (matches.length >= max) break;
      if (SKIP_DIRS.has(item.name)) continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!/\.(md|txt|ts|tsx|js|json|yaml|yml|sql)$/i.test(item.name)) continue;
      try {
        const lines = fs.readFileSync(full, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (matches.length >= max) break;
          if (lines[i]!.toLowerCase().includes(needle)) {
            matches.push({ path: rel, line: i + 1, text: lines[i]!.trim().slice(0, 200) });
          }
        }
      } catch {
        /* skip unreadable */
      }
    }
  }

  walk(base, args.path && args.path !== '.' ? args.path.replace(/\/$/, '') : '');
  return { query: args.query, matches };
}

export function repoWriteFile(args: { path: string; content: string }) {
  const target = resolveRepoPath(args.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, args.content, 'utf8');
  return { ok: true, path: args.path, bytes: Buffer.byteLength(args.content, 'utf8') };
}
