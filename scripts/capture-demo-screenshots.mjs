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

const shots = [
  { file: 'home.png', path: '/', name: 'Home' },
  { file: 'agents.png', path: '/agents', name: 'Agents registry' },
  { file: 'agent-editor.png', path: '/agents/default_ax_agent', name: 'Agent editor' },
  { file: 'operations-requests.png', path: '/operations/requests', name: 'Operations — Requests' },
  { file: 'operations-runs.png', path: '/operations/runs', name: 'Operations — Runs' },
  { file: 'run-detail.png', path: '/runs/df710880-9ec6-41b1-b171-f61b37450d7b', name: 'Run detail' },
  { file: 'operations-approvals.png', path: '/operations/approvals', name: 'Operations — Approvals' },
  { file: 'workflows.png', path: '/workflows', name: 'Workflows' },
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
  const waitUntil = shot.path.startsWith('/runs/') ? 'load' : 'networkidle';
  await page.goto(url, { waitUntil, timeout: 45_000 });
  await page.waitForTimeout(shot.path.startsWith('/runs/') ? 1500 : 800);
  await page.screenshot({
    path: path.join(outDir, shot.file),
    fullPage: false,
  });
  console.log('done');
}

await browser.close();
console.log(`\nSaved ${shots.length} screenshots to ${outDir}`);
