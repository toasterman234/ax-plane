import { getDefaultAgentConfig, parseAgentConfigJson } from '@axplane/agents';
import { makeDatabase, createRepositories } from '@axplane/db';
import { executeGraphRun, isGraphRun, resumeGraphRunAfterApproval } from '@axplane/graph';
import { runAgentForConfig } from '@axplane/runtime';
import {
  WorkerAlreadyRunningError,
  acquireWorkerLock,
  registerWorkerShutdown,
  writeWorkerHeartbeat,
} from '@axplane/runtime-dev';

const { db } = makeDatabase();
const repo = createRepositories(db);
const pollMs = Number(process.env.WORKER_POLL_MS ?? 1500);
const executionMode = process.env.AXPLANE_EXECUTION_MODE ?? 'mock';
const executionModeTyped = executionMode === 'real' ? 'real' : 'mock';

try {
  acquireWorkerLock();
  registerWorkerShutdown();
} catch (error) {
  if (error instanceof WorkerAlreadyRunningError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

async function ensureDemoAgent() {
  const config = getDefaultAgentConfig();
  await repo.upsertAgent({
    id: config.id,
    name: config.name,
    description: config.description,
    signature: config.signature,
    configJson: config,
  });
}

async function loadAgentConfigForRun(run: Awaited<ReturnType<typeof repo.listQueuedRuns>>[number]) {
  const version = run.agentVersionId
    ? await repo.getAgentVersion(run.agentVersionId)
    : await repo.getCurrentAgentVersion(run.agentId);

  if (version?.configJson) {
    try {
      return parseAgentConfigJson(version.configJson);
    } catch (error) {
      console.warn('Invalid agent config in DB, falling back to demo yaml', run.agentId, error);
    }
  }

  return getDefaultAgentConfig();
}

async function maybeResumeParentGraph(childRun: Awaited<ReturnType<typeof repo.getRun>>) {
  if (!childRun?.parentRunId) return;
  const parent = await repo.getRun(childRun.parentRunId);
  if (!parent || !isGraphRun(parent.inputJson) || parent.status !== 'needs_approval') return;

  await resumeGraphRunAfterApproval({
    repo,
    parentRunId: parent.id,
    mode: executionModeTyped,
    runAgent: runAgentForConfig,
    parseAgentConfig: parseAgentConfigJson,
  });
}

async function processRun(run: Awaited<ReturnType<typeof repo.listQueuedRuns>>[number]) {
  const claimed = await repo.claimQueuedRun(run.id);
  if (!claimed) return;

  if (isGraphRun(claimed.inputJson) || claimed.runKind === 'graph') {
    await executeGraphRun({
      repo,
      parentRunId: claimed.id,
      mode: executionModeTyped,
      runAgent: runAgentForConfig,
      parseAgentConfig: parseAgentConfigJson,
    });
    return;
  }

  const config = await loadAgentConfigForRun(claimed);
  const input = (claimed.inputJson ?? {}) as { taskText?: string; request?: string };
  const taskText = input.taskText ?? input.request ?? 'No request body provided.';
  await runAgentForConfig({
    runId: claimed.id,
    agentConfig: config,
    input: { taskText },
    repo,
    mode: executionModeTyped,
  });

  const refreshedChild = await repo.getRun(claimed.id);
  await maybeResumeParentGraph(refreshedChild);
}

async function tick() {
  writeWorkerHeartbeat({ mode: executionMode });
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
console.log(`AxPlane worker polling every ${pollMs}ms. Mode=${executionMode} pid=${process.pid}`);

setInterval(() => {
  tick().catch((error) => console.error('Worker tick failed', error));
}, pollMs);

await tick();
