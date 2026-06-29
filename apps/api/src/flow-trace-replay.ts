import { newFlowTraceRunId, publishFlowTrace } from '@axplane/flow-trace-bus';
import { streamAxDispatcherRun, type DispatcherStreamEvent, visualExpectationsFromRoutingCase } from '@axplane/flow-canvas';
import type { VisualPathExpectation } from '@axplane/flow-canvas';
import {
  getDispatcherRoutingCase,
  scoreRoutingCase,
  type DispatcherRoutingCase,
  type DispatcherRunResult,
} from './dispatcher-routing-cases.js';
import { publishDispatcherEvent } from './flow-trace-emit.js';

const ROUTING_STATUS = /Routing your request through the dispatcher/i;

export type ReplaySession = {
  runId: string;
  caseId: string;
  prompt: string;
  expectFirst?: string | null;
  expectAny?: string[];
  path: string;
  visualExpectation: VisualPathExpectation;
  status: 'running' | 'passed' | 'failed' | 'error';
  failureReason: string | null;
  delegates: string[];
  answerPreview: string;
  startedAt: string;
  completedAt: string | null;
};

const sessions = new Map<string, ReplaySession>();
const runningCases = new Set<string>();

export function getReplaySession(runId: string): ReplaySession | null {
  return sessions.get(runId) ?? null;
}

export function listReplaySessions(limit = 20): ReplaySession[] {
  return [...sessions.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/**
 * Observatory Slice C (C1) — re-run one ax-sandbox routing case against
 * ax-server `/dispatcher?stream=1`, publishing each drawable SSE event onto
 * the flow-trace bus under a fresh `runId`.
 */
export async function replayTrace(args: {
  caseId: string;
  includeSlow?: boolean;
}): Promise<ReplaySession> {
  const routingCase = await getDispatcherRoutingCase(args.caseId);
  if (!routingCase) {
    throw new Error(`Unknown routing case: ${args.caseId}`);
  }
  if (routingCase.slow && !args.includeSlow) {
    throw new Error(`Case ${args.caseId} is slow — pass includeSlow=true`);
  }
  if (runningCases.has(args.caseId)) {
    throw new Error(`Case ${args.caseId} is already replaying`);
  }

  const runId = newFlowTraceRunId();
  const visualExpectation = visualExpectationsFromRoutingCase(routingCase);
  const session: ReplaySession = {
    runId,
    caseId: routingCase.id,
    prompt: routingCase.prompt,
    expectFirst: routingCase.expectFirst,
    expectAny: routingCase.expectAny,
    path: routingCase.path,
    visualExpectation,
    status: 'running',
    failureReason: null,
    delegates: [],
    answerPreview: '',
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  sessions.set(runId, session);
  runningCases.add(args.caseId);

  // Seed the canvas with the case prompt (reduceFlowTrace reads thinking text as context).
  publishFlowTrace({
    runId,
    kind: 'thinking',
    text: routingCase.prompt,
    stage: 'case-prompt',
  });

  void runReplayInBackground(session, routingCase).finally(() => {
    runningCases.delete(args.caseId);
  });

  return session;
}

async function runReplayInBackground(
  session: ReplaySession,
  routingCase: DispatcherRoutingCase,
): Promise<void> {
  const delegates: string[] = [];
  const delegateArgs: unknown[] = [];
  let sawRoutingStatus = false;
  let streamError: string | undefined;
  let answer = '';

  try {
    const result = await streamAxDispatcherRun({
      query: routingCase.prompt,
      onEvent: (event: DispatcherStreamEvent) => {
        publishDispatcherEvent(session.runId, event);
        if ('type' in event && event.type === 'status' && ROUTING_STATUS.test(event.text)) {
          sawRoutingStatus = true;
        }
        if ('type' in event && event.type === 'tool-call') {
          const name = event.qualifiedName ?? event.name;
          if (name) {
            delegates.push(name);
            delegateArgs.push(event.args ?? null);
            session.delegates = [...delegates];
          }
        }
        if ('delta' in event && event.delta) answer += event.delta;
        if ('error' in event && event.error) streamError = event.error;
      },
    });

    answer = result.output || answer;
    session.answerPreview = answer.slice(0, 280);
    session.delegates = [...delegates];

    const run: DispatcherRunResult = {
      path: sawRoutingStatus || delegates.length > 0 ? 'dispatcher' : 'short-circuit',
      delegates,
      delegateArgs,
      answer,
      sawRoutingStatus,
      streamError: streamError ?? result.error,
    };

    const failureReason = await scoreRoutingCase(routingCase, run);
    session.failureReason = failureReason;
    session.status = failureReason ? 'failed' : 'passed';

    publishFlowTrace({
      runId: session.runId,
      kind: 'turn_complete',
      stage: failureReason ? 'replay-failed' : 'replay-complete',
      output: failureReason ?? answer.slice(0, 240),
      isError: Boolean(failureReason),
    });
  } catch (err) {
    session.status = 'error';
    session.failureReason = err instanceof Error ? err.message : String(err);
    publishFlowTrace({
      runId: session.runId,
      kind: 'turn_complete',
      stage: 'replay-error',
      output: session.failureReason,
      isError: true,
    });
  } finally {
    session.completedAt = new Date().toISOString();
    sessions.set(session.runId, session);
  }
}
