import { makeDatabase, createRepositories } from '@axplane/db';
import { getDemoAgentConfig } from '@axplane/agents';
import { runAxAgent } from '@axplane/ax-adapter';

const { db } = makeDatabase();
const repo = createRepositories(db);
const pollMs = Number(process.env.WORKER_POLL_MS ?? 1500);

async function ensureDemoAgent() {
  const config = getDemoAgentConfig();
  await repo.upsertAgent({
    id: config.id,
    name: config.name,
    description: config.description,
    signature: config.signature,
    configJson: config,
  });
}

async function processRun(run: Awaited<ReturnType<typeof repo.listQueuedRuns>>[number]) {
  const config = getDemoAgentConfig();
  const input = (run.inputJson ?? {}) as { request?: string };
  await runAxAgent({
    runId: run.id,
    agentConfig: config,
    input: { request: input.request ?? 'No request body provided.' },
    repo,
  });
}

async function tick() {
  const queued = await repo.listQueuedRuns(2);
  for (const run of queued) {
    try {
      await processRun(run);
    } catch (error) {
      console.error('Run failed', run.id, error);
    }
  }
}

await ensureDemoAgent();
console.log(`AxPlane worker polling every ${pollMs}ms. Mode=${process.env.AXPLANE_EXECUTION_MODE ?? 'mock'}`);

setInterval(() => {
  tick().catch((error) => console.error('Worker tick failed', error));
}, pollMs);

await tick();
