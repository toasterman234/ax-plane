import { evaluatePolicy, PendingApprovalError, PolicyBlockedError } from '@axplane/policy';
import { defaultToolRisk, executeHostTool } from '@axplane/host-tools';
import type { Repositories } from '@axplane/db';

export type GuardedToolArgs = {
  repo: Repositories;
  runId: string;
  qualifiedName: string;
  toolArgs: Record<string, unknown>;
  existingToolCallId?: string;
  skipIfCompleted?: boolean;
};

export async function guardedHostTool(args: GuardedToolArgs) {
  const { repo, runId, qualifiedName, toolArgs, existingToolCallId, skipIfCompleted = true } = args;
  const risk = defaultToolRisk(qualifiedName);

  if (skipIfCompleted && !existingToolCallId) {
    const cached = await repo.findCompletedToolCall(runId, qualifiedName, toolArgs);
    if (cached?.resultJson !== undefined && cached.resultJson !== null) {
      await repo.appendRunEvent(runId, 'ax.function_call.reused', {
        toolCallId: cached.id,
        qualifiedName,
        args: toolArgs,
        result: cached.resultJson,
      });
      return cached.resultJson;
    }
  }

  let toolCall = existingToolCallId ? await repo.getToolCall(existingToolCallId) : undefined;
  if (toolCall?.status === 'completed' && toolCall.resultJson !== undefined && toolCall.resultJson !== null) {
    await repo.appendRunEvent(runId, 'ax.function_call.reused', {
      toolCallId: toolCall.id,
      qualifiedName,
      args: toolArgs,
      result: toolCall.resultJson,
    });
    return toolCall.resultJson;
  }

  if (!toolCall) {
    toolCall = await repo.createToolCall({ runId, qualifiedName, argsJson: toolArgs, status: 'requested' });
    await repo.appendRunEvent(runId, 'ax.function_call.requested', { toolCallId: toolCall.id, qualifiedName, args: toolArgs, risk });
  }

  const decision = evaluatePolicy({ runId, qualifiedName, args: toolArgs, risk });

  if (decision.decision === 'block') {
    await repo.updateToolCall(toolCall.id, { status: 'blocked' });
    await repo.appendRunEvent(runId, 'ax.function_call.blocked', { toolCallId: toolCall.id, qualifiedName, decision });
    throw new PolicyBlockedError(decision.policyId, decision.reason);
  }

  if (decision.decision === 'approval_required') {
    const approved = await repo.getApprovedApprovalForTool(runId, qualifiedName);
    if (!approved) {
      const pending = await repo.findPendingApprovalForTool(runId, qualifiedName);
      if (pending) throw new PendingApprovalError(pending.id, pending.reason);
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

  const result = await executeHostTool(qualifiedName, toolArgs);

  await repo.updateToolCall(toolCall.id, { status: 'completed', resultJson: result });
  await repo.appendRunEvent(runId, 'ax.function_call.completed', { toolCallId: toolCall.id, qualifiedName, result });
  return result;
}
