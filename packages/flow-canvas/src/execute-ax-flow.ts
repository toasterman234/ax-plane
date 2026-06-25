import type { NodeInlineDetail, TraceOverlay } from './spec-to-flow';
import { applyAxFlowStreamEvent } from './derive-engine-run-overlay';
import { streamAxFlowRun, type AxFlowRunInput } from './fetch-runs';

export type AxFlowRepository = {
  updateRunStatus(
    runId: string,
    status: string,
    patch?: { outputJson?: unknown; error?: string },
  ): Promise<unknown>;
  appendRunEvent(runId: string, type: string, payload?: Record<string, unknown>): Promise<unknown>;
};

export async function executeAxFlowRun(args: {
  repo: AxFlowRepository;
  runId: string;
  input: AxFlowRunInput;
}) {
  const { repo, runId, input } = args;
  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'axflow.started', {
    flowId: input.flowId,
    flowInput: input.flowInput,
  });

  const overlay: TraceOverlay = {};
  const nodeDetails: Record<string, NodeInlineDetail> = {};

  try {
    const result = await streamAxFlowRun({
      flowId: input.flowId,
      input: input.flowInput,
      onEvent: async (event) => {
        applyAxFlowStreamEvent(overlay, nodeDetails, event);
        if (event.type === 'node-start') {
          await repo.appendRunEvent(runId, 'axflow.step.started', { stepId: event.nodeId });
        } else if (event.type === 'node-end') {
          await repo.appendRunEvent(runId, 'axflow.step.completed', {
            stepId: event.nodeId,
            latencySec: event.latencySec,
            output: event.output,
          });
        } else if (event.type === 'node-detail') {
          await repo.appendRunEvent(runId, 'axflow.step.detail', {
            stepId: event.nodeId,
            model: event.model,
            output: event.output,
          });
        }
      },
    });

    const output = {
      answer: result.output,
      axflow: {
        flowId: input.flowId,
        latencySec: result.latencySec,
        steps: overlay,
        nodeDetails,
      },
    };

    if (!result.ok) {
      await repo.updateRunStatus(runId, 'failed', {
        error: result.error ?? 'Flow failed',
        outputJson: output,
      });
      await repo.appendRunEvent(runId, 'axflow.failed', { error: result.error, flowId: input.flowId });
      return output;
    }

    await repo.updateRunStatus(runId, 'completed', { outputJson: output });
    await repo.appendRunEvent(runId, 'axflow.completed', { flowId: input.flowId, latencySec: result.latencySec });
    await repo.appendRunEvent(runId, 'run.completed', { output });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repo.updateRunStatus(runId, 'failed', { error: message });
    await repo.appendRunEvent(runId, 'axflow.failed', { error: message, flowId: input.flowId });
    throw error;
  }
}
