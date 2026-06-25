import type { Repositories } from '@axplane/db';
import type { AgentConfig } from '@axplane/agents';
import { evaluatePolicy, PendingApprovalError, PolicyBlockedError } from '@axplane/policy';

export type RunAxAgentArgs = {
  runId: string;
  agentConfig: AgentConfig;
  input: { request: string };
  repo: Repositories;
  mode?: 'mock' | 'real';
};

async function guardedFakeTool(args: {
  repo: Repositories;
  runId: string;
  qualifiedName: string;
  toolArgs: Record<string, unknown>;
  risk?: 'safe' | 'medium' | 'risky';
}) {
  const { repo, runId, qualifiedName, toolArgs, risk } = args;
  const toolCall = await repo.createToolCall({ runId, qualifiedName, argsJson: toolArgs, status: 'requested' });
  await repo.appendRunEvent(runId, 'ax.function_call.requested', { toolCallId: toolCall.id, qualifiedName, args: toolArgs, risk });

  const decision = evaluatePolicy({ runId, qualifiedName, args: toolArgs, risk });

  if (decision.decision === 'block') {
    await repo.updateToolCall(toolCall.id, { status: 'blocked' });
    await repo.appendRunEvent(runId, 'ax.function_call.blocked', { toolCallId: toolCall.id, qualifiedName, decision });
    throw new PolicyBlockedError(decision.policyId, decision.reason);
  }

  if (decision.decision === 'approval_required') {
    const approved = await repo.getApprovedApprovalForTool(runId, qualifiedName);
    if (!approved) {
      const approval = await repo.createApproval({
        runId,
        toolCallId: toolCall.id,
        toolName: qualifiedName,
        reason: decision.reason,
        requestedActionJson: { qualifiedName, args: toolArgs, policyId: decision.policyId },
      });
      await repo.updateToolCall(toolCall.id, { status: 'approval_required', approvalId: approval.id });
      await repo.appendRunEvent(runId, 'ax.function_call.approval_required', {
        toolCallId: toolCall.id,
        approvalId: approval.id,
        qualifiedName,
        decision,
      });
      throw new PendingApprovalError(approval.id, decision.reason);
    }
  }

  await repo.updateToolCall(toolCall.id, { status: 'allowed' });
  await repo.appendRunEvent(runId, 'ax.function_call.allowed', { toolCallId: toolCall.id, qualifiedName, decision });

  const result = qualifiedName === 'fake.projectLookup'
    ? { project: 'AxPlane MVP', constraints: ['local-first', 'approval-gated tools', 'durable event log'] }
    : { ok: true, fakeSideEffect: 'approved-risky-action-executed', received: toolArgs };

  await repo.updateToolCall(toolCall.id, { status: 'completed', resultJson: result });
  await repo.appendRunEvent(runId, 'ax.function_call.completed', { toolCallId: toolCall.id, qualifiedName, result });
  return result;
}

export async function runMockAxAgent(args: RunAxAgentArgs) {
  const { repo, runId, input } = args;
  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'run.started', { input, mode: 'mock' });

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'distiller',
    turn: 1,
    javascriptCode: 'const request = inputs.request; console.log(request.slice(0, 80));',
    result: input.request.slice(0, 80),
  });

  const project = await guardedFakeTool({
    repo,
    runId,
    qualifiedName: 'fake.projectLookup',
    toolArgs: { query: input.request },
    risk: 'safe',
  });

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'executor',
    turn: 2,
    javascriptCode: 'const project = await fake.projectLookup({ query: inputs.request }); console.log(project);',
    result: project,
  });

  await guardedFakeTool({
    repo,
    runId,
    qualifiedName: 'fake.riskyAction',
    toolArgs: { reason: 'MVP approval-gate validation', request: input.request },
    risk: 'risky',
  });

  await repo.appendRunEvent(runId, 'ax.actor_turn', {
    stage: 'executor',
    turn: 3,
    javascriptCode: 'const riskyResult = await fake.riskyAction({ reason: "MVP approval-gate validation" }); await final(...);',
    result: { ok: true },
  });

  const output = {
    answer: `Handled request: ${input.request}. The safe lookup ran, the risky fake tool was approved, and the run completed.`,
    nextActions: ['Replace fake tools with real host-side tool wrappers', 'Switch AXPLANE_EXECUTION_MODE=real when provider keys are ready'],
  };

  await repo.appendRunEvent(runId, 'ax.chat_log.captured', {
    chatLog: [
      { role: 'user', content: input.request },
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

export async function runRealAxAgent(args: RunAxAgentArgs) {
  const { repo, runId, input, agentConfig } = args;
  await repo.updateRunStatus(runId, 'running');
  await repo.appendRunEvent(runId, 'run.started', { input, mode: 'real' });

  const ax = await import('@ax-llm/ax');
  const { agent, ai, AxJSRuntime, f, fn } = ax as any;

  const provider = process.env.AX_PROVIDER ?? 'openai';
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
  const model = process.env.AX_MODEL ?? 'gpt-4o-mini';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or OPENAI_APIKEY is required for AXPLANE_EXECUTION_MODE=real');
  }

  const llm = ai({
    name: provider,
    apiKey,
    config: { model, temperature: 0 },
  });

  const runtime = new AxJSRuntime();

  const functions = [
    fn('projectLookup')
      .description('Return deterministic fake project context for the request.')
      .namespace('fake')
      .arg('query', f.string('Project lookup query'))
      .returns(f.string('Project context as JSON'))
      .handler(async ({ query }: { query: string }) => guardedFakeTool({
        repo,
        runId,
        qualifiedName: 'fake.projectLookup',
        toolArgs: { query },
        risk: 'safe',
      }).then((value: unknown) => JSON.stringify(value)))
      .build(),
    fn('riskyAction')
      .description('Fake side-effecting action used to validate approval gates.')
      .namespace('fake')
      .arg('reason', f.string('Reason for the risky action'))
      .returns(f.string('Risky action result as JSON'))
      .handler(async ({ reason }: { reason: string }) => guardedFakeTool({
        repo,
        runId,
        qualifiedName: 'fake.riskyAction',
        toolArgs: { reason },
        risk: 'risky',
      }).then((value: unknown) => JSON.stringify(value)))
      .build(),
  ];

  const axAgent = agent(agentConfig.signature, {
    name: agentConfig.name,
    contextFields: agentConfig.contextFields ?? [],
    runtime,
    functions,
    contextPolicy: agentConfig.contextPolicy ?? { preset: 'checkpointed', budget: 'balanced' },
    actorTurnCallback: async (turn: unknown) => repo.appendRunEvent(runId, 'ax.actor_turn', { turn }),
    onContextEvent: async (event: unknown) => repo.appendRunEvent(runId, 'ax.context_event', { event }),
    agentStatusCallback: async (message: string, status: unknown) => repo.appendRunEvent(runId, 'run.status', { message, status }),
    onFunctionCall: async (call: unknown) => repo.appendRunEvent(runId, 'ax.function_call.requested', { call, source: 'ax-callback-observation' }),
  });

  const output = await axAgent.forward(llm, input);
  await repo.appendRunEvent(runId, 'ax.chat_log.captured', { chatLog: axAgent.getChatLog?.() ?? null });
  await repo.appendRunEvent(runId, 'ax.usage.captured', { usage: axAgent.getUsage?.() ?? null, stagedUsage: axAgent.getStagedUsage?.() ?? null });
  await repo.appendRunEvent(runId, 'ax.traces.captured', { traces: axAgent.getTraces?.() ?? null });
  await repo.updateRunStatus(runId, 'completed', { outputJson: output });
  await repo.appendRunEvent(runId, 'run.completed', { output });
  return output;
}

export async function runAxAgent(args: RunAxAgentArgs) {
  const mode = args.mode ?? (process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock');
  try {
    return mode === 'real' ? await runRealAxAgent(args) : await runMockAxAgent(args);
  } catch (error) {
    if (error instanceof PendingApprovalError) {
      await args.repo.updateRunStatus(args.runId, 'needs_approval');
      await args.repo.appendRunEvent(args.runId, 'run.status', { status: 'needs_approval', approvalId: error.approvalId, message: error.message });
      return { pendingApprovalId: error.approvalId };
    }

    const message = error instanceof Error ? error.message : String(error);
    await args.repo.updateRunStatus(args.runId, 'failed', { error: message });
    await args.repo.appendRunEvent(args.runId, 'run.failed', { error: message });
    throw error;
  }
}
