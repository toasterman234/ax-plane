import type { TraceOverlay } from './spec-to-flow';
import { applyDispatcherStreamEvent } from './derive-dispatcher-overlay';
import type { AxDispatcherRunInput } from './derive-dispatcher-overlay';
import { streamAxDispatcherRun } from './fetch-dispatcher';
import type { DispatcherStreamEvent } from './dispatcher-types';
import { delegateNodeId } from './dispatcher-types';

function ok(): import('./spec-to-flow').NodeRunInfo {
  return { latencySec: null, ok: true, status: 'ok' };
}

export type AxDispatcherRepository = {
  updateRunStatus(
    runId: string,
    status: string,
    patch?: { outputJson?: unknown; error?: string },
  ): Promise<unknown>;
  appendRunEvent(runId: string, type: string, payload?: Record<string, unknown>): Promise<unknown>;
};

async function persistDispatcherEvent(
  repo: AxDispatcherRepository,
  runId: string,
  event: DispatcherStreamEvent,
): Promise<void> {
  if ('delta' in event) return;

  if ('error' in event) {
    await repo.appendRunEvent(runId, 'dispatcher.failed', { error: event.error });
    return;
  }

  if (!('type' in event)) return;

  if (event.type === 'route-decision') {
    await repo.appendRunEvent(runId, 'dispatcher.route', {
      route: event.route,
      mechanism: event.mechanism,
      rationale: event.rationale,
    });
    return;
  }

  if (event.type === 'status') {
    await repo.appendRunEvent(runId, 'dispatcher.status', { text: event.text });
    return;
  }

  if (event.type === 'turn') {
    await repo.appendRunEvent(runId, 'dispatcher.turn', {
      stage: event.stage,
      turn: event.turn,
      model: event.model,
      latencySec: event.latencySec,
      isError: event.isError,
      modelOutput: event.modelOutput?.slice(0, 500),
      output: event.output?.slice(0, 500),
    });
    return;
  }

  if (event.type === 'tool-call') {
    await repo.appendRunEvent(runId, 'dispatcher.delegate', {
      name: event.name,
      qualifiedName: event.qualifiedName,
      args: event.args,
    });
    return;
  }

  if (event.type === 'assert') {
    await repo.appendRunEvent(runId, 'dispatcher.status', { text: event.text, kind: 'assert' });
  }
}

export async function executeAxDispatcherRun(args: {
  repo: AxDispatcherRepository;
  runId: string;
  input: AxDispatcherRunInput;
}) {
  const { repo, runId, input } = args;
  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'dispatcher.started', { query: input.query });

  const delegates: TraceOverlay = {};
  const overlay: TraceOverlay = {};
  const nodeDetails: Record<string, import('./spec-to-flow').NodeInlineDetail> = {};

  try {
    const result = await streamAxDispatcherRun({
      query: input.query,
      onEvent: async (event) => {
        applyDispatcherStreamEvent(overlay, nodeDetails, event);
        if ('type' in event && event.type === 'tool-call') {
          const nodeId = delegateNodeId(event.qualifiedName ?? event.name);
          if (nodeId) delegates[nodeId] = overlay[nodeId] ?? ok();
        }
        await persistDispatcherEvent(repo, runId, event);
      },
    });

    const output = {
      answer: result.output,
      dispatcher: {
        latencySec: result.latencySec,
        delegates,
        overlay,
      },
    };

    if (!result.ok) {
      await repo.updateRunStatus(runId, 'failed', {
        error: result.error ?? 'Dispatcher failed',
        outputJson: output,
      });
      await repo.appendRunEvent(runId, 'dispatcher.failed', { error: result.error });
      return output;
    }

    await repo.updateRunStatus(runId, 'completed', { outputJson: output });
    await repo.appendRunEvent(runId, 'dispatcher.completed', { latencySec: result.latencySec });
    await repo.appendRunEvent(runId, 'run.completed', { output });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repo.updateRunStatus(runId, 'failed', { error: message });
    await repo.appendRunEvent(runId, 'dispatcher.failed', { error: message });
    throw error;
  }
}
