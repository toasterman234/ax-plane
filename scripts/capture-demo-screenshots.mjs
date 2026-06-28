#!/usr/bin/env node
/**
 * Capture dashboard screenshots for README / docs.
 * Requires: ax-plane dev stack on localhost:3010
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.SCREENSHOT_OUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUT_DIR)
  : path.resolve(__dirname, '../docs/screenshots');
const baseUrl = process.env.AXPLANE_DASHBOARD_URL ?? 'http://localhost:3010';

/** @type {Array<{ file: string; path: string; name: string; waitUntil?: 'load' | 'networkidle'; settleMs?: number; prepare?: (page: import('playwright').Page) => Promise<void> }>} */
const shots = [
  { file: 'home.png', path: '/', name: 'Home' },
  { file: 'agents.png', path: '/agents', name: 'Agents registry' },
  { file: 'agent-editor.png', path: '/agents/default_ax_agent', name: 'Agent editor' },
  { file: 'operations-requests.png', path: '/operations/requests', name: 'Operations — Requests' },
  {
    file: 'operations-board.png',
    path: '/operations/board',
    name: 'Operations — Board',
    settleMs: 2000,
  },
  { file: 'operations-runs.png', path: '/operations/runs', name: 'Operations — Runs' },
  {
    file: 'run-detail.png',
    path: '/runs/df710880-9ec6-41b1-b171-f61b37450d7b',
    name: 'Run detail',
    waitUntil: 'load',
    settleMs: 1500,
  },
  { file: 'operations-approvals.png', path: '/operations/approvals', name: 'Operations — Approvals' },
  { file: 'workflows.png', path: '/workflows', name: 'Workflows hub' },
  {
    file: 'workflows-canvas.png',
    path: '/workflows',
    name: 'Graph workflow canvas',
    settleMs: 1200,
    prepare: async (page) => {
      const classify = page.getByRole('button', { name: /Classify/i }).first();
      if (await classify.count()) await classify.click();
      await page.locator('.flow-canvas-host').first().scrollIntoViewIfNeeded();
    },
  },
  {
    file: 'ax-flows.png',
    path: '/workflows/ax-flows',
    name: 'AX Flows catalog + canvas',
    settleMs: 1200,
    prepare: async (page) => {
      const fanout = page.getByRole('button', { name: /Fanout And Synthesize/i }).first();
      if (await fanout.count()) {
        await fanout.click();
      } else {
        await page.locator('button').filter({ hasText: /pattern-/ }).first().click();
      }
      await page.locator('.flow-canvas-host').first().scrollIntoViewIfNeeded();
    },
  },
  {
    file: 'dispatcher.png',
    path: '/workflows/dispatcher',
    name: 'AX Dispatcher orchestrator',
    settleMs: 1200,
    prepare: async (page) => {
      await page.locator('.flow-canvas-host').first().scrollIntoViewIfNeeded();
    },
  },
  {
    file: 'agents-eval.png',
    path: '/agents/eval',
    name: 'Eval lab',
    settleMs: 1000,
    prepare: async (page) => {
      const runRow = page.locator('button').filter({ hasText: /passed · avg/i }).first();
      if (await runRow.count()) await runRow.click();
      await page.getByRole('heading', { name: 'Run detail' }).scrollIntoViewIfNeeded().catch(() => {});
    },
  },
  { file: 'agents-forge.png', path: '/agents/forge', name: 'Agent Forge' },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

for (const shot of shots) {
  const url = `${baseUrl}${shot.path}`;
  process.stdout.write(`Capturing ${shot.name} … `);
  const waitUntil = shot.waitUntil ?? (shot.path.startsWith('/runs/') ? 'load' : 'networkidle');
  await page.goto(url, { waitUntil, timeout: 45_000 });
  if (shot.prepare) await shot.prepare(page);
  await page.waitForTimeout(shot.settleMs ?? (shot.path.startsWith('/runs/') ? 1500 : 800));
  await page.screenshot({
    path: path.join(outDir, shot.file),
    fullPage: false,
  });
  console.log('done');
}

await browser.close();
console.log(`\nSaved ${shots.length} screenshots to ${outDir}`);
