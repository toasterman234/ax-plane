import type { Repositories } from '@axplane/db';
import type { AgentConfig } from '@axplane/agents';
import { PendingApprovalError } from '@axplane/policy';
import { buildAxFunctions } from './build-functions';
import { guardedHostTool } from './guarded-tool';
import { readRunResume, type RunResumeCheckpoint } from './resume';

export type RunAxAgentArgs = {
  runId: string;
  agentConfig: AgentConfig;
  input: { taskText: string };
  repo: Repositories;
  mode?: 'mock' | 'real';
};

export type LlmConfig = {
  provider: string;
  apiKey: string;
  apiURL?: string;
  model: string;
};

export function resolveLlmConfig(): LlmConfig {
  const apiKey =
    process.env.AX_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_APIKEY;

  if (!apiKey) {
    throw new Error(
      'A model API key is required for AXPLANE_EXECUTION_MODE=real. Set AX_API_KEY (cliproxy) or OPENAI_API_KEY.',
    );
  }

  return {
    provider: process.env.AX_PROVIDER ?? 'openai',
    apiKey,
    apiURL: process.env.AX_BASE_URL,
    model: process.env.AX_MODEL ?? 'gpt-4o-mini',
  };
}

function createLlm(ax: typeof import('@ax-llm/ax'), config: LlmConfig) {
  return ax.ai({
    name: config.provider,
    apiKey: config.apiKey,
    ...(config.apiURL ? { apiURL: config.apiURL } : {}),
    config: { model: config.model, temperature: 0 },
  } as never);
}

export async function runMockAxAgent(args: RunAxAgentArgs) {
  const { repo, runId, input } = args;
  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'run.started', { input, mode: 'mock' });

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'distiller',
    turn: 1,
    javascriptCode: 'const request = inputs.request; console.log(request.slice(0, 80));',
    result: input.taskText.slice(0, 80),
  });

  const project = await guardedHostTool({
    repo,
    runId,
    qualifiedName: 'fake.projectLookup',
    toolArgs: { query: input.taskText },
  });

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'executor',
    turn: 2,
    javascriptCode: 'const project = await fake.projectLookup({ query: inputs.request }); console.log(project);',
    result: project,
  });

  await guardedHostTool({
    repo,
    runId,
    qualifiedName: 'fake.riskyAction',
    toolArgs: { reason: 'MVP approval-gate validation', request: input.taskText },
  });

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'executor',
    turn: 3,
    javascriptCode: 'const riskyResult = await fake.riskyAction({ reason: "MVP approval-gate validation" }); await final(...);',
    result: { ok: true },
  });

  const output = {
    answer: `Handled request: ${input.taskText}. The safe lookup ran, the risky fake tool was approved, and the run completed.`,
    nextActions: ['Try repo.readFile on README.md', 'Use docs.search for architecture notes'],
  };

  await repo.appendRunEvent(runId, 'ax.chat_log.captured', {
    chatLog: [
      { role: 'user', content: input.taskText },
      { role: 'assistant', content: output.answer },
    ],
  });
  await repo.appendRunEvent(runId, 'ax.usage.captured', {
    usage: { totalTokens: 0, note: 'mock mode' },
    stagedUsage: { distiller: {}, executor: {}, responder: {} },
  });
  await repo.appendRunEvent(runId, 'ax.traces.captured', {
    traces: [{ name: 'mock.axplane.run', runId, events: ['distiller', 'executor', 'responder'] }],
  });
  await repo.updateRunStatus(runId, 'completed', { outputJson: output });
  await repo.appendRunEvent(runId, 'run.completed', { output });
  return output;
}

async function captureAxProgramTelemetry(
  repo: Repositories,
  runId: string,
  program: {
    getChatLog?: () => unknown;
    getUsage?: () => unknown;
    getStagedUsage?: () => unknown;
    getTraces?: () => unknown;
  },
) {
  await repo.appendRunEvent(runId, 'ax.chat_log.captured', { chatLog: program.getChatLog?.() ?? null });
  await repo.appendRunEvent(runId, 'ax.usage.captured', {
    usage: program.getUsage?.() ?? null,
    stagedUsage: program.getStagedUsage?.() ?? null,
  });
  await repo.appendRunEvent(runId, 'ax.traces.captured', { traces: program.getTraces?.() ?? null });
}

function buildResumeOutput(taskText: string, completedTools: Array<{ qualifiedName: string; resultJson: unknown }>) {
  return {
    answer: `Handled request: ${taskText}. Prior tools finished; the risky fake tool was approved, and the run completed.`,
    nextActions: [
      'Try repo.readFile or docs.search on the next run',
    ],
    toolResults: completedTools.map((tool) => ({ name: tool.qualifiedName, result: tool.resultJson })),
  };
}

async function finishRunWithOutput(
  repo: Repositories,
  runId: string,
  input: { taskText: string },
  output: Record<string, unknown>,
  telemetry?: { getChatLog?: () => unknown; getUsage?: () => unknown; getStagedUsage?: () => unknown; getTraces?: () => unknown },
) {
  await repo.appendRunEvent(runId, 'ax.chat_log.captured', {
    chatLog: telemetry?.getChatLog?.() ?? [
      { role: 'user', content: input.taskText },
      { role: 'assistant', content: String(output.answer ?? '') },
    ],
  });
  await repo.appendRunEvent(runId, 'ax.usage.captured', {
    usage: telemetry?.getUsage?.() ?? { note: 'resume completion' },
    stagedUsage: telemetry?.getStagedUsage?.() ?? null,
  });
  await repo.appendRunEvent(runId, 'ax.traces.captured', {
    traces: telemetry?.getTraces?.() ?? [{ name: 'axplane.resume', runId }],
  });
  await repo.updateRunStatus(runId, 'completed', { outputJson: output });
  await repo.appendRunEvent(runId, 'run.completed', { output });
  return output;
}

async function finishRealRunAfterTools(args: RunAxAgentArgs, completedTools: Awaited<ReturnType<Repositories['listToolCallsForRun']>>) {
  const { repo, runId, input, agentConfig } = args;
  const ax = await import('@ax-llm/ax');
  const llm = createLlm(ax, resolveLlmConfig());
  const toolSummary = completedTools
    .filter((tool) => tool.status === 'completed')
    .map((tool) => `${tool.qualifiedName}: ${JSON.stringify(tool.resultJson)}`)
    .join('\n');

  const program = ax.ax(agentConfig.signature, {
    description: `${agentConfig.description}\n\nTool results are already final. Do not call tools again.\n${toolSummary}`,
  });

  const output = await program.forward(llm, { taskText: input.taskText }, { debug: true });
  await captureAxProgramTelemetry(repo, runId, program);
  await repo.updateRunStatus(runId, 'completed', { outputJson: output });
  await repo.appendRunEvent(runId, 'run.completed', { output, resumed: true });
  return output;
}

async function resumeAfterApproval(args: RunAxAgentArgs & { resume: RunResumeCheckpoint }) {
  const { repo, runId, input, resume } = args;
  const mode = args.mode ?? (process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock');

  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'run.resumed', { resume, mode });
  await repo.clearRunResume(runId);

  await guardedHostTool({
    repo,
    runId,
    qualifiedName: resume.qualifiedName,
    toolArgs: resume.toolArgs,
    existingToolCallId: resume.toolCallId,
    skipIfCompleted: false,
  });

  const completedTools = await repo.listToolCallsForRun(runId);
  if (mode === 'real') {
    return finishRealRunAfterTools(args, completedTools);
  }

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'responder',
    turn: 'resume',
    result: { resumed: true, completedTool: resume.qualifiedName },
  });

  const output = buildResumeOutput(
    input.taskText,
    completedTools.filter((tool) => tool.status === 'completed').map((tool) => ({
      qualifiedName: tool.qualifiedName,
      resultJson: tool.resultJson,
    })),
  );
  return finishRunWithOutput(repo, runId, input, output);
}

/** Native tool-calling path — matches ax-lab keystone pattern (no JS-runtime loop). */
export async function runRealAxNativeAgent(args: RunAxAgentArgs) {
  const { repo, runId, input, agentConfig } = args;
  const llmConfig = resolveLlmConfig();
  const events = await repo.listRunEvents(runId);
  if (!events.some((event) => event.type === 'run.started')) {
    await repo.updateRunStatus(runId, 'running');
    await repo.appendRunEvent(runId, 'run.started', { input, mode: 'real', execution: 'native-tools' });
  }

  const ax = await import('@ax-llm/ax');
  const llm = createLlm(ax, llmConfig);
  const functions = buildAxFunctions(repo, runId, agentConfig.tools);

  const program = ax.ax(agentConfig.signature, {
    description: agentConfig.description,
    functions,
  });

  const output = await program.forward(llm, input, { debug: true });
  await captureAxProgramTelemetry(repo, runId, program);
  await repo.updateRunStatus(runId, 'completed', { outputJson: output });
  await repo.appendRunEvent(runId, 'run.completed', { output });
  return output;
}

/** RLM pipeline path — Ax agent() with JS runtime (demo default config). */
export async function runRealAxRlmAgent(args: RunAxAgentArgs) {
  const { repo, runId, input, agentConfig } = args;
  const llmConfig = resolveLlmConfig();
  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'run.started', { input, mode: 'real', execution: 'rlm-agent' });

  const ax = await import('@ax-llm/ax');
  const { agent, AxJSRuntime } = ax;
  const llm = createLlm(ax, llmConfig);
  const runtime = new AxJSRuntime();
  const functions = buildAxFunctions(repo, runId, agentConfig.tools);

  const axAgent = agent(agentConfig.signature, {
    agentIdentity: { name: agentConfig.name, description: agentConfig.description },
    contextFields: agentConfig.contextFields ?? [],
    runtime,
    functions,
    contextPolicy: (agentConfig.contextPolicy ?? { preset: 'checkpointed', budget: 'balanced' }) as never,
    actorTurnCallback: async (turn: unknown) => {
      await repo.appendRunEvent(runId, 'ax.actor_turn', { turn });
    },
    onContextEvent: async (event: unknown) => {
      await repo.appendRunEvent(runId, 'ax.context_event', { event });
    },
    agentStatusCallback: async (message: string, status: unknown) => {
      await repo.appendRunEvent(runId, 'run.status', { message, status });
    },
    onFunctionCall: async (call: unknown) => {
      await repo.appendRunEvent(runId, 'ax.function_call.requested', { call, source: 'ax-callback-observation' });
    },
  });

  const output = await axAgent.forward(llm, input);
  await captureAxProgramTelemetry(repo, runId, axAgent);
  await repo.updateRunStatus(runId, 'completed', { outputJson: output });
  await repo.appendRunEvent(runId, 'run.completed', { output });
  return output;
}

export async function runRealAxAgent(args: RunAxAgentArgs) {
  const strategy = process.env.AXPLANE_REAL_STRATEGY ?? 'native';
  return strategy === 'native' ? runRealAxNativeAgent(args) : runRealAxRlmAgent(args);
}

function findPendingApproval(error: unknown): PendingApprovalError | null {
  if (error instanceof PendingApprovalError) return error;
  if (error && typeof error === 'object' && 'cause' in error) {
    return findPendingApproval((error as { cause: unknown }).cause);
  }
  return null;
}

export async function runAxAgent(args: RunAxAgentArgs) {
  const mode = args.mode ?? (process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock');
  const run = await args.repo.getRun(args.runId);
  const resume = readRunResume(run?.inputJson);

  try {
    if (resume) {
      return await resumeAfterApproval({ ...args, resume, mode });
    }
    return mode === 'real' ? await runRealAxAgent(args) : await runMockAxAgent(args);
  } catch (error) {
    const pending = findPendingApproval(error);
    if (pending) {
      await args.repo.updateRunStatus(args.runId, 'needs_approval');
      await args.repo.appendRunEvent(args.runId, 'run.status', {
        status: 'needs_approval',
        approvalId: pending.approvalId,
        message: pending.message,
      });
      return { pendingApprovalId: pending.approvalId };
    }

    const message = error instanceof Error ? error.message : String(error);
    await args.repo.updateRunStatus(args.runId, 'failed', { error: message });
    await args.repo.appendRunEvent(args.runId, 'run.failed', { error: message });
    throw error;
  }
}
