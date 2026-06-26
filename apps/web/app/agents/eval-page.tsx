'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_AGENT_ID } from '@/lib/constants';
import type { AgentRow, AgentVersion, EvalMatrix, EvalRun, EvalSuite } from '@/lib/eval-types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CaseHeatmap } from '@/components/eval/case-heatmap';
import { ScoreTrendChart } from '@/components/eval/score-trend-chart';
import { EvalCaseRow } from '@/components/eval/eval-case-row';

export default function EvalPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [agentVersionId, setAgentVersionId] = useState('');
  const [mode, setMode] = useState<'mock' | 'real'>('mock');
  const [selectedSuiteId, setSelectedSuiteId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunId, setCompareRunId] = useState('');
  const [running, setRunning] = useState(false);

  const suites = useQuery({ queryKey: ['eval-suites'], queryFn: () => api<EvalSuite[]>('/eval/suites') });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<AgentRow[]>('/agents') });
  const activeSuiteId = selectedSuiteId || suites.data?.[0]?.id || '';

  const runs = useQuery({
    queryKey: ['eval-runs', activeSuiteId, agentId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeSuiteId) params.set('suiteId', activeSuiteId);
      if (agentId) params.set('agentId', agentId);
      const query = params.toString();
      return api<EvalRun[]>(`/eval/runs${query ? `?${query}` : ''}`);
    },
    enabled: Boolean(activeSuiteId),
  });

  const matrix = useQuery({
    queryKey: ['eval-matrix', activeSuiteId, agentId],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '8' });
      if (agentId) params.set('agentId', agentId);
      return api<EvalMatrix>(`/eval/suites/${activeSuiteId}/matrix?${params.toString()}`);
    },
    enabled: Boolean(activeSuiteId),
  });

  const versions = useQuery({
    queryKey: ['agent-versions', agentId],
    queryFn: () => api<AgentVersion[]>(`/agents/${agentId}/versions`),
    enabled: Boolean(agentId),
  });

  const runDetail = useQuery({
    queryKey: ['eval-run', selectedRunId],
    queryFn: () => api<EvalRun>(`/eval/runs/${selectedRunId}`),
    enabled: Boolean(selectedRunId),
  });

  const compareRun = useQuery({
    queryKey: ['eval-run', compareRunId],
    queryFn: () => api<EvalRun>(`/eval/runs/${compareRunId}`),
    enabled: Boolean(compareRunId),
  });

  const versionById = useMemo(() => {
    const map = new Map<string, number>();
    for (const version of versions.data ?? []) map.set(version.id, version.version);
    return map;
  }, [versions.data]);

  const compareResultsByCaseId = useMemo(() => {
    const map = new Map<string, NonNullable<EvalRun['results']>[number]>();
    for (const row of compareRun.data?.results ?? []) map.set(row.caseId, row);
    return map;
  }, [compareRun.data?.results]);

  const comparison = useMemo(() => {
    if (!runDetail.data?.summaryJson || !compareRun.data?.summaryJson) return null;
    const a = runDetail.data.summaryJson;
    const b = compareRun.data.summaryJson;
    return {
      scoreDelta: a.averageScore - b.averageScore,
      passedDelta: a.passedCases - b.passedCases,
    };
  }, [runDetail.data, compareRun.data]);

  async function seedDemoSuite() {
    setMessage(null);
    setError(null);
    try {
      const suite = await api<EvalSuite>('/eval/suites/seed-smoke', { method: 'POST' });
      await suites.refetch();
      setSelectedSuiteId(suite.id);
      setMessage(`Smoke suite ready (${suite.cases.length} cases)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed suite');
    }
  }

  async function runSuite() {
    if (!activeSuiteId) return;
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api<{ evalRunId: string; summary: EvalRun['summaryJson'] }>('/eval/runs', {
        method: 'POST',
        body: JSON.stringify({
          suiteId: activeSuiteId,
          agentId,
          agentVersionId: agentVersionId || undefined,
          mode,
        }),
      });
      await Promise.all([runs.refetch(), matrix.refetch()]);
      setSelectedRunId(result.evalRunId);
      setMessage(
        `Eval finished — ${result.summary?.passedCases ?? 0}/${result.summary?.caseCount ?? 0} cases passed (avg ${result.summary?.averageScore ?? 0}%)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eval run failed');
    } finally {
      setRunning(false);
    }
  }

  function selectRun(runId: string) {
    setSelectedRunId(runId);
  }

  const suiteRuns = runs.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Eval lab</h1>
        <p className="text-sm text-muted-foreground">
          Run suites against agents, compare results, and spot regressions with the case heatmap and score trend.
        </p>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Suites</h2>
          <Button className="bg-secondary text-secondary-foreground hover:opacity-90" onClick={seedDemoSuite}>
            Install smoke suite
          </Button>
        </div>
        {(suites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No suites yet. Install the smoke suite to start.</p>
        ) : (
          <div className="space-y-2">
            {suites.data?.map((suite) => (
              <button
                key={suite.id}
                type="button"
                onClick={() => setSelectedSuiteId(suite.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  suite.id === activeSuiteId ? 'border-emerald-700 bg-emerald-950/30' : 'border-border'
                }`}
              >
                <div className="font-medium">{suite.name}</div>
                <div className="text-muted-foreground">{suite.description}</div>
                <div className="text-xs text-muted-foreground">{suite.cases.length} cases</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Run suite</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm text-foreground">
            Agent
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={agentId}
              onChange={(e) => { setAgentId(e.target.value); setAgentVersionId(''); }}
            >
              {(agents.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Version
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={agentVersionId}
              onChange={(e) => setAgentVersionId(e.target.value)}
            >
              <option value="">Current</option>
              {(versions.data ?? []).map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}{version.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Mode
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'mock' | 'real')}
            >
              <option value="mock">mock (fast)</option>
              <option value="real">real (LLM)</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button onClick={runSuite} disabled={running || !activeSuiteId}>
              {running ? 'Running…' : 'Run eval'}
            </Button>
          </div>
        </div>
      </Card>

      {activeSuiteId ? (
        <Card className="space-y-6 p-4">
          <div>
            <h2 className="text-lg font-semibold">Insights</h2>
            <p className="text-sm text-muted-foreground">
              Last 8 finished runs for this suite and agent. Click a column or chart point to open run detail.
            </p>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Case heatmap</h3>
              {matrix.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading matrix…</p>
              ) : matrix.data ? (
                <CaseHeatmap
                  matrix={matrix.data}
                  selectedRunId={selectedRunId}
                  onSelectRun={selectRun}
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Score trend</h3>
              <ScoreTrendChart
                runs={suiteRuns}
                versionById={versionById}
                selectedRunId={selectedRunId}
                onSelectRun={selectRun}
              />
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        {suiteRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs for this suite and agent yet.</p>
        ) : (
          <ul className="space-y-2">
            {suiteRuns.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => selectRun(run.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selectedRunId === run.id ? 'border-sky-700 bg-sky-950/20' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap gap-3 text-foreground">
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                    <span>{run.mode}</span>
                    <span className={run.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}>{run.status}</span>
                    {run.summaryJson ? (
                      <span>{run.summaryJson.passedCases}/{run.summaryJson.caseCount} passed · avg {run.summaryJson.averageScore}%</span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {runDetail.data ? (
        <Card className="space-y-4 p-4">
          <h2 className="text-lg font-semibold">Run detail</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-foreground">
              Compare against
              <select
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                value={compareRunId}
                onChange={(e) => setCompareRunId(e.target.value)}
              >
                <option value="">Select prior run</option>
                {suiteRuns.filter((run) => run.id !== runDetail.data?.id).map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.createdAt).toLocaleString()} — {run.summaryJson?.averageScore ?? '?'}%
                  </option>
                ))}
              </select>
            </label>
            {comparison ? (
              <div className="text-sm text-foreground">
                <div>Score delta: {comparison.scoreDelta >= 0 ? '+' : ''}{comparison.scoreDelta}%</div>
                <div>Passed cases delta: {comparison.passedDelta >= 0 ? '+' : ''}{comparison.passedDelta}</div>
              </div>
            ) : null}
          </div>
          <ul className="space-y-3">
            {(runDetail.data.results ?? []).map((result) => (
              <EvalCaseRow
                key={result.id}
                result={result}
                compareResult={compareRunId ? compareResultsByCaseId.get(result.caseId) : null}
              />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
