import fs from 'node:fs';
import path from 'node:path';
import { docsRoot } from './paths';

const SKIP_DIRS = new Set(['node_modules', '.git']);

export function docsSearch(args: { query: string; maxResults?: number }) {
  const root = docsRoot();
  const max = Math.min(args.maxResults ?? 20, 50);
  const needle = args.query.toLowerCase();
  const matches: Array<{ path: string; line: number; text: string }> = [];

  function walk(dir: string, prefix: string) {
    if (matches.length >= max || !fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (matches.length >= max) break;
      if (SKIP_DIRS.has(item.name)) continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!/\.(md|mdx|txt)$/i.test(item.name)) continue;
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (matches.length >= max) break;
        if (lines[i]!.toLowerCase().includes(needle)) {
          matches.push({ path: rel, line: i + 1, text: lines[i]!.trim().slice(0, 200) });
        }
      }
    }
  }

  walk(root, '');
  return { root, query: args.query, matches };
}
