'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { LabEvalComparison } from '@axplane/eval/lab-comparison';
import { buildCaseComparisonRows } from '@axplane/eval/lab-comparison';
import { api } from '@/lib/api';
import type { EvalRun } from '@/lib/eval-types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MetricComparisonChart } from '@/components/eval/metric-comparison-chart';
import { PerCaseDeltaTable } from '@/components/eval/per-case-delta-table';

type EvalSuite = {
  id: string;
  name: string;
  description: string;
  agentId?: string | null;
  cases: Array<{ id: string; name: string; taskText: string }>;
};

type EvalRunSummary = {
  caseCount: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  mode: string;
};

type OptimizationRun = {
  id: string;
  status: string;
  optimizerType: string;
  baselineEvalRunId: string | null;
  candidateEvalRunId: string | null;
  candidateId: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type AgentCandidate = {
  id: string;
  name: string;
  status: string;
  artifactText: string | null;
  baselineScore: number | null;
  candidateScore: number | null;
  metricsJson: {
    comparison?: LabEvalComparison;
  } | null;
  promotedAt: string | null;
  createdAt: string;
};

type AgentDetail = { id: string; name: string };

export function AgentLab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suiteId, setSuiteId] = useState('');
  const [mode, setMode] = useState<'mock' | 'real'>('mock');
  const [optimizerType, setOptimizerType] = useState<'ax-native-mock' | 'ax-native'>('ax-native-mock');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [lastOptimization, setLastOptimization] = useState<{
    optimizationRunId: string;
    baselineEvalRunId: string;
    candidateEvalRunId: string;
    candidateId: string;
    comparison: LabEvalComparison;
  } | null>(null);

  const agent = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api<AgentDetail>(`/agents/${agentId}`),
  });
  const suites = useQuery({
    queryKey: ['lab-suites', agentId],
    queryFn: () => api<EvalSuite[]>(`/agents/${agentId}/lab/suites`),
  });
  const optimizationRuns = useQuery({
    queryKey: ['lab-optimization-runs', agentId],
    queryFn: () => api<OptimizationRun[]>(`/agents/${agentId}/lab/optimization-runs`),
  });
  const candidates = useQuery({
    queryKey: ['lab-candidates', agentId],
    queryFn: () => api<AgentCandidate[]>(`/agents/${agentId}/lab/candidates`),
  });

  const activeSuiteId = suiteId || suites.data?.[0]?.id || '';
  const selectedCandidate = useMemo(
    () => (candidates.data ?? []).find((row) => row.id === selectedCandidateId) ?? null,
    [candidates.data, selectedCandidateId],
  );
  const comparison = lastOptimization?.comparison
    ?? selectedCandidate?.metricsJson?.comparison
    ?? null;

  const comparisonEvalRunIds = useMemo(() => {
    if (lastOptimization) {
      return {
        baseline: lastOptimization.baselineEvalRunId,
        candidate: lastOptimization.candidateEvalRunId,
      };
    }
    if (selectedCandidateId) {
      const optRun = optimizationRuns.data?.find((row) => row.candidateId === selectedCandidateId);
      if (optRun?.baselineEvalRunId && optRun.candidateEvalRunId) {
        return {
          baseline: optRun.baselineEvalRunId,
          candidate: optRun.candidateEvalRunId,
        };
      }
    }
    return null;
  }, [lastOptimization, optimizationRuns.data, selectedCandidateId]);

  const baselineEvalRun = useQuery({
    queryKey: ['eval-run', comparisonEvalRunIds?.baseline],
    queryFn: () => api<EvalRun>(`/eval/runs/${comparisonEvalRunIds!.baseline}`),
    enabled: Boolean(comparisonEvalRunIds?.baseline),
  });
  const candidateEvalRun = useQuery({
    queryKey: ['eval-run', comparisonEvalRunIds?.candidate],
    queryFn: () => api<EvalRun>(`/eval/runs/${comparisonEvalRunIds!.candidate}`),
    enabled: Boolean(comparisonEvalRunIds?.candidate),
  });

  const caseComparisonRows = useMemo(() => {
    const baselineResults = baselineEvalRun.data?.results ?? [];
    const candidateResults = candidateEvalRun.data?.results ?? [];
    if (baselineResults.length === 0 && candidateResults.length === 0) return [];
    return buildCaseComparisonRows(
      baselineResults.map((row) => ({
        caseId: row.caseId,
        caseName: row.caseName,
        status: row.status,
        score: row.score,
      })),
      candidateResults.map((row) => ({
        caseId: row.caseId,
        caseName: row.caseName,
        status: row.status,
        score: row.score,
      })),
    );
  }, [baselineEvalRun.data?.results, candidateEvalRun.data?.results]);

  const baselineRunsByCaseId = useMemo(
    () => new Map((baselineEvalRun.data?.results ?? []).map((row) => [row.caseId, row.runId])),
    [baselineEvalRun.data?.results],
  );
  const candidateRunsByCaseId = useMemo(
    () => new Map((candidateEvalRun.data?.results ?? []).map((row) => [row.caseId, row.runId])),
    [candidateEvalRun.data?.results],
  );

  const seedSuite = useMutation({
    mutationFn: () => api<EvalSuite>(`/agents/${agentId}/lab/suites/seed-smoke`, { method: 'POST' }),
    onSuccess: async (suite) => {
      setSuiteId(suite.id);
      setMessage(`Seeded eval suite (${suite.cases.length} cases)`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['lab-suites', agentId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Seed failed'),
  });

  const baselineEval = useMutation({
    mutationFn: () => api<{ evalRunId: string; summary: EvalRunSummary }>(`/agents/${agentId}/lab/baseline-eval`, {
      method: 'POST',
      body: JSON.stringify({ suiteId: activeSuiteId, mode }),
    }),
    onSuccess: (result) => {
      setMessage(`Baseline eval: ${result.summary.passedCases}/${result.summary.caseCount} passed · avg ${result.summary.averageScore}%`);
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Baseline eval failed'),
  });

  const optimize = useMutation({
    mutationFn: () => api<{
      optimizationRunId: string;
      baselineEvalRunId: string;
      candidateEvalRunId: string;
      candidateId: string;
      comparison: LabEvalComparison;
      baselineSummary: EvalRunSummary;
      candidateSummary: EvalRunSummary;
    }>(`/agents/${agentId}/lab/optimize`, {
      method: 'POST',
      body: JSON.stringify({
        suiteId: activeSuiteId,
        mode: optimizerType === 'ax-native' ? 'real' : mode,
        optimizerType,
      }),
    }),
    onSuccess: async (result) => {
      setLastOptimization(result);
      setSelectedCandidateId(result.candidateId);
      setMessage(
        `Optimization complete — baseline ${result.baselineSummary.averageScore}% → candidate ${result.candidateSummary.averageScore}%`,
      );
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lab-optimization-runs', agentId] }),
        queryClient.invalidateQueries({ queryKey: ['lab-candidates', agentId] }),
        queryClient.invalidateQueries({ queryKey: ['eval-run', result.baselineEvalRunId] }),
        queryClient.invalidateQueries({ queryKey: ['eval-run', result.candidateEvalRunId] }),
      ]);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Optimization failed'),
  });

  const promote = useMutation({
    mutationFn: (candidateId: string) => api(`/agents/${agentId}/lab/candidates/${candidateId}/promote`, { method: 'POST' }),
    onSuccess: async () => {
      setMessage('Candidate promoted as new agent version.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['lab-candidates', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['agent-versions', agentId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Promote failed'),
  });

  const reject = useMutation({
    mutationFn: (candidateId: string) => api(`/agents/${agentId}/lab/candidates/${candidateId}/reject`, { method: 'POST' }),
    onSuccess: async () => {
      setMessage('Candidate rejected.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['lab-candidates', agentId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Reject failed'),
  });

  const busy = seedSuite.isPending || baselineEval.isPending || optimize.isPending;

  if (agent.isLoading) return <p className="text-sm text-muted-foreground">Loading agent…</p>;
  if (agent.isError || !agent.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">Agent not found or API unreachable.</p>
        <Link href="/agents" className="text-sm text-muted-foreground hover:text-accent-foreground">← Back to agents</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Lab</h1>
        <p className="text-sm text-muted-foreground">
          Eval → optimize → compare → promote for <span className="text-foreground">{agent.data.name}</span>.
          Mock optimizer works without API keys; <span className="text-foreground">ax-native</span> calls <code className="text-xs">agent.optimize()</code> in real mode.
        </p>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Eval set</h2>
          <Button
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={() => seedSuite.mutate()}
            disabled={seedSuite.isPending}
          >
            Install smoke suite
          </Button>
        </div>
        {(suites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No eval suites for this agent yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <select
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={activeSuiteId}
              onChange={(e) => setSuiteId(e.target.value)}
            >
              {(suites.data ?? []).map((suite) => (
                <option key={suite.id} value={suite.id}>{suite.name} ({suite.cases.length} cases)</option>
              ))}
            </select>
            <select
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={optimizerType}
              onChange={(e) => setOptimizerType(e.target.value as 'ax-native-mock' | 'ax-native')}
            >
              <option value="ax-native-mock">optimizer: mock</option>
              <option value="ax-native">optimizer: ax-native</option>
            </select>
            <select
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={optimizerType === 'ax-native' ? 'real' : mode}
              disabled={optimizerType === 'ax-native'}
              onChange={(e) => setMode(e.target.value as 'mock' | 'real')}
            >
              <option value="mock">mode: mock</option>
              <option value="real">mode: real</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => baselineEval.mutate()} disabled={busy || !activeSuiteId}>
                Run baseline
              </Button>
              <Button onClick={() => optimize.mutate()} disabled={busy || !activeSuiteId}>
                {optimize.isPending ? 'Optimizing…' : 'Optimize agent'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {comparison ? (
        <Card className="space-y-6 p-4">
          <div>
            <h2 className="text-lg font-semibold">Comparison</h2>
            <p className="text-sm text-muted-foreground">
              Score {comparison.delta.score >= 0 ? '+' : ''}{comparison.delta.score}% ·
              passed cases {comparison.delta.passedCases >= 0 ? '+' : ''}{comparison.delta.passedCases} ·
              turns {comparison.delta.avgTurns >= 0 ? '+' : ''}{comparison.delta.avgTurns} ·
              mistakes {comparison.delta.toolMistakes >= 0 ? '+' : ''}{comparison.delta.toolMistakes}
            </p>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Metrics</h3>
              <MetricComparisonChart comparison={comparison} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Per-case delta</h3>
              {baselineEvalRun.isLoading || candidateEvalRun.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading case results…</p>
              ) : (
                <PerCaseDeltaTable
                  rows={caseComparisonRows}
                  baselineRunsByCaseId={baselineRunsByCaseId}
                  candidateRunsByCaseId={candidateRunsByCaseId}
                />
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Candidates</h2>
        {(candidates.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No candidates yet. Run Optimize agent to create one.</p>
        ) : (
          <ul className="space-y-3">
            {(candidates.data ?? []).map((candidate) => (
              <li key={candidate.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{candidate.name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(candidate.createdAt).toLocaleString()}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Status: <span className="text-foreground">{candidate.status}</span>
                      {candidate.baselineScore != null && candidate.candidateScore != null ? (
                        <span> · {candidate.baselineScore}% → {candidate.candidateScore}%</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-secondary text-secondary-foreground hover:opacity-90"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                    >
                      View
                    </Button>
                    {candidate.status === 'evaluated' ? (
                      <>
                        <Button onClick={() => promote.mutate(candidate.id)} disabled={promote.isPending}>
                          Promote
                        </Button>
                        <Button
                          className="bg-red-950 text-red-200 hover:bg-red-900"
                          onClick={() => reject.mutate(candidate.id)}
                          disabled={reject.isPending}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                {selectedCandidateId === candidate.id && candidate.artifactText ? (
                  <pre className="mt-3 overflow-x-auto rounded-md bg-card p-3 text-xs text-foreground whitespace-pre-wrap">
                    {candidate.artifactText}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">Optimization runs</h2>
        {(optimizationRuns.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No optimization runs yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(optimizationRuns.data ?? []).map((run) => (
              <li key={run.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex flex-wrap gap-3 text-foreground">
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                  <span>{run.optimizerType}</span>
                  <span className={run.status === 'completed' ? 'text-emerald-400' : run.status === 'failed' ? 'text-red-400' : 'text-amber-400'}>
                    {run.status}
                  </span>
                </div>
                {run.error ? <p className="mt-1 text-xs text-red-400">{run.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
