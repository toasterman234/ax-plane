import type { AgentConfig } from '@axplane/agents';
import type { GraphRunInput, GraphRunState, GraphWorkflow, GraphWorkflowStep } from './types';
import { resolveInputTemplate } from './template';

export type GraphRepository = {
  getGraphWorkflow(workflowId: string): Promise<GraphWorkflow | null>;
  getRun(id: string): Promise<{
    id: string;
    status: string;
    requestId: string;
    inputJson: unknown;
    outputJson?: unknown;
    error?: string | null;
  } | null>;
  patchRunInputJson(runId: string, patch: Record<string, unknown>): Promise<unknown>;
  createChildRun(input: {
    parentRunId: string;
    requestId: string;
    agentId: string;
    stepKey: string;
    taskText: string;
  }): Promise<{ id: string }>;
  appendRunEvent(runId: string, type: string, payload?: Record<string, unknown>): Promise<unknown>;
  updateRunStatus(
    runId: string,
    status: string,
    patch?: { outputJson?: unknown; error?: string },
  ): Promise<unknown>;
  getCurrentAgentVersion(agentId: string): Promise<{ id: string; configJson: unknown } | null>;
  getAgentVersion(versionId: string): Promise<{ id: string; configJson: unknown } | null>;
};

export type RunAgentFn = (args: {
  runId: string;
  agentConfig: AgentConfig;
  input: { taskText: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any;
  mode?: 'mock' | 'real';
}) => Promise<unknown>;

function readGraphInput(inputJson: unknown): GraphRunInput | null {
  if (!inputJson || typeof inputJson !== 'object') return null;
  const record = inputJson as Record<string, unknown>;
  if (record.runKind !== 'graph' || typeof record.workflowId !== 'string') return null;
  return {
    runKind: 'graph',
    workflowId: record.workflowId,
    taskText: String(record.taskText ?? ''),
    graphState: record.graphState as GraphRunState | undefined,
  };
}

function isPendingApproval(result: unknown): result is { pendingApprovalId: string } {
  return Boolean(result && typeof result === 'object' && 'pendingApprovalId' in result);
}

export async function executeGraphRun(args: {
  repo: GraphRepository;
  parentRunId: string;
  mode?: 'mock' | 'real';
  runAgent: RunAgentFn;
  parseAgentConfig: (json: unknown) => AgentConfig;
}) {
  const mode = args.mode ?? 'mock';
  const parent = await args.repo.getRun(args.parentRunId);
  if (!parent) throw new Error(`Parent run not found: ${args.parentRunId}`);

  const graphInput = readGraphInput(parent.inputJson);
  if (!graphInput) throw new Error('Run is not a graph orchestration run');

  const workflow = await args.repo.getGraphWorkflow(graphInput.workflowId);
  if (!workflow) throw new Error(`Graph workflow not found: ${graphInput.workflowId}`);

  const state: GraphRunState = graphInput.graphState ?? { stepIndex: 0, stepOutputs: {} };
  await args.repo.updateRunStatus(args.parentRunId, 'running');
  await args.repo.appendRunEvent(args.parentRunId, 'graph.started', {
    workflowId: workflow.id,
    stepCount: workflow.steps.length,
    mode,
  });

  for (let index = state.stepIndex; index < workflow.steps.length; index += 1) {
    const step = workflow.steps[index]!;
    const taskText = resolveInputTemplate(step.inputTemplate, {
      taskText: graphInput.taskText,
      steps: Object.fromEntries(
        Object.entries(state.stepOutputs).map(([key, value]) => [key, { output: value.output }]),
      ),
    });

    await args.repo.appendRunEvent(args.parentRunId, 'graph.step.started', {
      stepId: step.id,
      agentId: step.agentId,
      stepIndex: index,
      taskText,
    });

    const child = await args.repo.createChildRun({
      parentRunId: args.parentRunId,
      requestId: parent.requestId,
      agentId: step.agentId,
      stepKey: step.id,
      taskText,
    });

    await args.repo.appendRunEvent(args.parentRunId, 'graph.step.queued', {
      stepId: step.id,
      childRunId: child.id,
    });

    const version = await args.repo.getCurrentAgentVersion(step.agentId);
    if (!version?.configJson) throw new Error(`No agent version for ${step.agentId}`);
    const agentConfig = args.parseAgentConfig(version.configJson);

    const result = await args.runAgent({
      runId: child.id,
      agentConfig,
      input: { taskText },
      repo: args.repo,
      mode,
    });

    const childRun = await args.repo.getRun(child.id);
    const childStatus = childRun?.status ?? 'failed';

    if (isPendingApproval(result) || childStatus === 'needs_approval') {
      state.stepIndex = index;
      const pendingApprovalId =
        isPendingApproval(result) ? result.pendingApprovalId : undefined;
      await args.repo.patchRunInputJson(args.parentRunId, {
        graphState: state,
        pendingChildRunId: child.id,
      });
      await args.repo.updateRunStatus(args.parentRunId, 'needs_approval');
      await args.repo.appendRunEvent(args.parentRunId, 'run.status', {
        status: 'needs_approval',
        message: `Graph paused at step ${step.id} — child run needs approval`,
        childRunId: child.id,
      });
      return { pendingApprovalId, childRunId: child.id };
    }

    if (childStatus === 'failed') {
      const message = childRun?.error ?? `Step ${step.id} failed`;
      await args.repo.updateRunStatus(args.parentRunId, 'failed', { error: message });
      await args.repo.appendRunEvent(args.parentRunId, 'graph.failed', { stepId: step.id, message });
      throw new Error(message);
    }

    const output = childRun?.outputJson ?? result;
    state.stepOutputs[step.id] = { output, childRunId: child.id, status: childStatus };
    state.stepIndex = index + 1;

    await args.repo.appendRunEvent(args.parentRunId, 'graph.step.completed', {
      stepId: step.id,
      childRunId: child.id,
      status: childStatus,
    });
    await args.repo.appendRunEvent(args.parentRunId, 'graph.handoff', {
      fromStepId: step.id,
      toStepId: workflow.steps[index + 1]?.id ?? null,
      output,
    });

    await args.repo.patchRunInputJson(args.parentRunId, {
      graphState: state,
    });
  }

  const lastStep = workflow.steps[workflow.steps.length - 1];
  const finalOutput = lastStep ? state.stepOutputs[lastStep.id]?.output : null;
  const output = {
    answer:
      finalOutput && typeof finalOutput === 'object' && finalOutput !== null && 'answer' in finalOutput
        ? String((finalOutput as { answer: unknown }).answer)
        : `Graph workflow ${workflow.id} completed.`,
    graph: {
      workflowId: workflow.id,
      steps: state.stepOutputs,
    },
  };

  await args.repo.updateRunStatus(args.parentRunId, 'completed', { outputJson: output });
  await args.repo.appendRunEvent(args.parentRunId, 'graph.completed', { output, workflowId: workflow.id });
  await args.repo.appendRunEvent(args.parentRunId, 'run.completed', { output });
  return output;
}

export async function resumeGraphRunAfterApproval(args: {
  repo: GraphRepository;
  parentRunId: string;
  mode?: 'mock' | 'real';
  runAgent: RunAgentFn;
  parseAgentConfig: (json: unknown) => AgentConfig;
}) {
  const parent = await args.repo.getRun(args.parentRunId);
  const graphInput = readGraphInput(parent?.inputJson);
  if (!graphInput?.graphState) throw new Error('No graph state to resume');

  const workflow = await args.repo.getGraphWorkflow(graphInput.workflowId);
  if (!workflow) throw new Error(`Graph workflow not found: ${graphInput.workflowId}`);

  const pendingChildId = (parent?.inputJson as { pendingChildRunId?: string })?.pendingChildRunId;
  if (pendingChildId) {
    const child = await args.repo.getRun(pendingChildId);
    if (child?.status !== 'completed') {
      throw new Error('Child run not completed after approval');
    }
    const step = workflow.steps[graphInput.graphState.stepIndex];
    if (step) {
      graphInput.graphState.stepOutputs[step.id] = {
        output: child.outputJson,
        childRunId: child.id,
        status: child.status,
      };
      graphInput.graphState.stepIndex += 1;
    }
  }

  await args.repo.patchRunInputJson(args.parentRunId, {
    graphState: graphInput.graphState,
    pendingChildRunId: undefined,
  });
  await args.repo.updateRunStatus(args.parentRunId, 'running');
  await args.repo.appendRunEvent(args.parentRunId, 'graph.resumed', { graphState: graphInput.graphState });

  return executeGraphRun({
    ...args,
    parentRunId: args.parentRunId,
  });
}

export function isGraphRun(inputJson: unknown): boolean {
  return readGraphInput(inputJson) !== null;
}

export function parseWorkflowSteps(steps: unknown): GraphWorkflowStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => {
    const row = step as Record<string, unknown>;
    return {
      id: String(row.id),
      agentId: String(row.agentId),
      inputTemplate: String(row.inputTemplate ?? '{{taskText}}'),
    };
  });
}
