import { z } from 'zod';

export const PolicyDecisionSchema = z.enum(['allow', 'block', 'approval_required', 'warn']);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export type ToolInvocation = {
  runId: string;
  qualifiedName: string;
  args: Record<string, unknown>;
  risk?: 'safe' | 'medium' | 'risky';
};

export type PolicyResult = {
  decision: PolicyDecision;
  reason: string;
  policyId: string;
};

export function evaluatePolicy(invocation: ToolInvocation): PolicyResult {
  const name = invocation.qualifiedName;
  const serializedArgs = JSON.stringify(invocation.args ?? {});

  if (/sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}/.test(serializedArgs)) {
    return {
      decision: 'block',
      reason: 'Arguments look like they may contain a secret token.',
      policyId: 'block_secret_exfiltration',
    };
  }

  const risky =
    invocation.risk === 'risky'
    || name === 'fake.riskyAction'
    || name === 'repo.writeFile'
    || name === 'shell.run'
    || name.startsWith('github.create');

  if (risky) {
    return {
      decision: 'approval_required',
      reason: `${name} is a write or side-effecting tool and requires human approval before execution.`,
      policyId: 'write_tool_requires_approval',
    };
  }

  return {
    decision: 'allow',
    reason: 'Read-only tool or no blocking policy matched.',
    policyId: 'default_allow',
  };
}

export class PendingApprovalError extends Error {
  constructor(public approvalId: string, message = 'Run paused pending approval') {
    super(message);
    this.name = 'PendingApprovalError';
  }
}

export class PolicyBlockedError extends Error {
  constructor(public policyId: string, message = 'Tool call blocked by policy') {
    super(message);
    this.name = 'PolicyBlockedError';
  }
}
