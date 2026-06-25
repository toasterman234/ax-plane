import type { AgentConfig } from '@axplane/agents';
import type { EvalCriterion, EvalRunSummary } from './types';
import { scoreEvalCase, summarizeEvalCases } from './scoring';

export type EvalRepository = {
  getEvalSuite(suiteId: string): Promise<{
    id: string;
    name: string;
    description: string;
    cases: Array<{
      id: string;
      name: string;
      taskText: string;
      criteria: EvalCriterion[];
      sortOrder: number;
    }>;
  } | null>;
  createEvalRun(input: {
    suiteId: string;
    agentId: string;
    agentVersionId?: string | null;
    mode: 'mock' | 'real';
  }): Promise<{ id: string }>;
  updateEvalRun(
    evalRunId: string,
    patch: { status: string; summaryJson?: EvalRunSummary; completedAt?: Date },
  ): Promise<unknown>;
  createEvalCaseResult(input: {
    evalRunId: string;
    caseId: string;
    runId: string | null;
    status: 'passed' | 'failed' | 'error';
    score: number;
    detailsJson: unknown;
  }): Promise<unknown>;
  createRequest(input: { body: string; agentId: string; routeDecision: unknown }): Promise<{ id: string }>;
  createRun(input: {
    requestId: string;
    agentId: string;
    agentVersionId?: string | null;
    inputJson?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  getRun(id: string): Promise<{
    id: string;
    status: string;
    outputJson: unknown;
    error?: string | null;
  } | null>;
  listRunEvents(runId: string): Promise<Array<{ type: string; payloadJson: unknown }>>;
  listToolCallsForRun(runId: string): Promise<Array<{ qualifiedName: string; status: string }>>;
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

export type ExecuteEvalRunArgs = {
  repo: EvalRepository;
  suiteId: string;
  agentId: string;
  agentVersionId?: string;
  mode?: 'mock' | 'real';
  runAgent: RunAgentFn;
  parseAgentConfig: (json: unknown) => AgentConfig;
};

export async function executeEvalRun(args: ExecuteEvalRunArgs) {
  const mode = args.mode ?? 'mock';
  const suite = await args.repo.getEvalSuite(args.suiteId);
  if (!suite) throw new Error(`Eval suite not found: ${args.suiteId}`);

  const version = args.agentVersionId
    ? await args.repo.getAgentVersion(args.agentVersionId)
    : await args.repo.getCurrentAgentVersion(args.agentId);
  if (!version?.configJson) throw new Error(`No agent version for ${args.agentId}`);
  const agentConfig = args.parseAgentConfig(version.configJson);

  const evalRun = await args.repo.createEvalRun({
    suiteId: suite.id,
    agentId: args.agentId,
    agentVersionId: version.id,
    mode,
  });

  const caseRows: Array<{ name: string; score: ReturnType<typeof scoreEvalCase>; passed: boolean }> = [];

  for (const evalCase of suite.cases) {
    let runId: string | null = null;
    try {
      const request = await args.repo.createRequest({
        body: evalCase.taskText,
        agentId: args.agentId,
        routeDecision: {
          selectedAgentId: args.agentId,
          reason: `Eval case: ${evalCase.name}`,
          strategy: 'eval',
        },
      });

      const run = await args.repo.createRun({
        requestId: request.id,
        agentId: args.agentId,
        agentVersionId: version.id,
        inputJson: { taskText: evalCase.taskText, evalRunId: evalRun.id, evalCaseId: evalCase.id },
      });
      runId = run.id;

      await args.runAgent({
        runId: run.id,
        agentConfig,
        input: { taskText: evalCase.taskText },
        repo: args.repo,
        mode,
      });

      const snapshotRun = await args.repo.getRun(run.id);
      const events = await args.repo.listRunEvents(run.id);
      const toolCalls = await args.repo.listToolCallsForRun(run.id);
      const score = scoreEvalCase(
        {
          status: (snapshotRun?.status ?? 'failed') as 'completed',
          outputJson: snapshotRun?.outputJson,
          error: snapshotRun?.error,
          events,
          toolCalls,
        },
        evalCase.criteria as EvalCriterion[],
      );
      const passed = score.passed === score.total;
      caseRows.push({ name: evalCase.name, score, passed });

      await args.repo.createEvalCaseResult({
        evalRunId: evalRun.id,
        caseId: evalCase.id,
        runId,
        status: passed ? 'passed' : 'failed',
        score: score.score,
        detailsJson: score,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const emptyScore = scoreEvalCase(
        { status: 'failed', outputJson: null, error: message, events: [], toolCalls: [] },
        evalCase.criteria as EvalCriterion[],
      );
      caseRows.push({ name: evalCase.name, score: emptyScore, passed: false });
      await args.repo.createEvalCaseResult({
        evalRunId: evalRun.id,
        caseId: evalCase.id,
        runId,
        status: 'error',
        score: 0,
        detailsJson: { error: message, score: emptyScore },
      });
    }
  }

  const partial = summarizeEvalCases(caseRows);
  const summary: EvalRunSummary = { ...partial, mode };
  await args.repo.updateEvalRun(evalRun.id, {
    status: partial.failedCases === 0 ? 'completed' : 'failed',
    summaryJson: summary,
    completedAt: new Date(),
  });

  return { evalRunId: evalRun.id, summary, cases: caseRows };
}
