/**
 * End-to-end real Ax smoke with resume after approval (Step D).
 */
import { loadEnv } from '../../db/src/load-env.js';
import { makeDatabase, createRepositories } from '@axplane/db';
import { getDefaultAgentConfig } from '@axplane/agents';
import { runAxAgent } from '../src/index.js';

loadEnv();

const { db } = makeDatabase();
const repo = createRepositories(db);
const config = getDefaultAgentConfig();

await repo.upsertAgent({
  id: config.id,
  name: config.name,
  description: config.description,
  signature: config.signature,
  configJson: config,
});

const request = await repo.createRequest({
  body: 'Summarize AxPlane in one sentence and call the risky fake tool to test approval resume.',
  agentId: config.id,
  routeDecision: {
    selectedAgentId: config.id,
    reason: 'Smoke test explicit route',
    strategy: 'explicit',
  },
});

const run = await repo.createRun({ requestId: request.id, agentId: config.id });
console.log('run', run.id);

const first = await runAxAgent({
  runId: run.id,
  agentConfig: config,
  input: { taskText: request.body },
  repo,
  mode: 'real',
});

if (!('pendingApprovalId' in first) || !first.pendingApprovalId) {
  console.error('expected approval pause, got', first);
  process.exit(1);
}

console.log('paused for approval', first.pendingApprovalId);
const startedCount = (await repo.listRunEvents(run.id)).filter((e) => e.type === 'run.started').length;

await repo.resolveApproval(first.pendingApprovalId, 'approved', 'smoke-test');

const second = await runAxAgent({
  runId: run.id,
  agentConfig: config,
  input: { taskText: request.body },
  repo,
  mode: 'real',
});

const events = await repo.listRunEvents(run.id);
const resumed = events.some((e) => e.type === 'run.resumed');
const startedAfter = events.filter((e) => e.type === 'run.started').length;
const reused = events.filter((e) => e.type === 'ax.function_call.reused').length;

console.log('output', JSON.stringify(second, null, 2));
console.log({ resumed, startedAfter, reused, startedCount });

const detail = await repo.getRun(run.id);
console.log('final status', detail?.status);

if (detail?.status !== 'completed' || !resumed || startedAfter !== startedCount) {
  process.exit(1);
}
