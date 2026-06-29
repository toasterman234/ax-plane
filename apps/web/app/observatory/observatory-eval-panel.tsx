'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_AGENT_ID } from '@/lib/constants';
import type { AgentRow, EvalRun, EvalSuite } from '@/lib/eval-types';
import { fetchEvalMatrix } from '@/lib/eval-matrix-client';
import { CaseHeatmap } from '@/components/eval/case-heatmap';
import { EvalCaseRow } from '@/components/eval/eval-case-row';

/**
 * Observatory Slice D — Eval Lab suite heatmap without leaving the cockpit.
 */
export function ObservatoryEvalPanel() {
  const [suiteId, setSuiteId] = useState('');
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const suites = useQuery({
    queryKey: ['eval-suites'],
    queryFn: () => api<EvalSuite[]>('/eval/suites'),
  });

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<AgentRow[]>('/agents'),
  });

  const activeSuiteId = suiteId || suites.data?.[0]?.id || '';
  const activeSuite = useMemo(
    () => suites.data?.find((s) => s.id === activeSuiteId) ?? null,
    [suites.data, activeSuiteId],
  );

  const matrix = useQuery({
    queryKey: ['eval-matrix', activeSuiteId, agentId],
    queryFn: () =>
      fetchEvalMatrix({
        suiteId: activeSuiteId,
        suite: activeSuite!,
        agentId,
        limit: 8,
      }),
    enabled: Boolean(activeSuiteId && activeSuite),
  });

  const runDetail = useQuery({
    queryKey: ['eval-run', selectedRunId],
    queryFn: () => api<EvalRun>(`/eval/runs/${selectedRunId}`),
    enabled: Boolean(selectedRunId),
  });

  const selectedResult = useMemo(() => {
    if (!selectedCaseId || !runDetail.data?.results) return null;
    return runDetail.data.results.find((r) => r.caseId === selectedCaseId) ?? null;
  }, [selectedCaseId, runDetail.data?.results]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Suite
          <select
            className="mt-1 block min-w-[12rem] rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            value={activeSuiteId}
            onChange={(e) => {
              setSuiteId(e.target.value);
              setSelectedRunId(null);
              setSelectedCaseId(null);
            }}
          >
            {(suites.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Agent
          <select
            className="mt-1 block min-w-[10rem] rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setSelectedRunId(null);
              setSelectedCaseId(null);
            }}
          >
            {(agents.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <Link href="/agents/eval" className="pb-1.5 text-xs text-sky-400 hover:underline">
          Full eval lab →
        </Link>
      </div>

      {matrix.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading heatmap…</p>
      ) : matrix.isError ? (
        <p className="text-sm text-red-400">
          {matrix.error instanceof Error ? matrix.error.message : 'Failed to load heatmap'}
        </p>
      ) : matrix.data ? (
        <div className="max-h-56 overflow-auto rounded-md border border-border bg-card/30 p-2">
          <CaseHeatmap
            matrix={matrix.data}
            selectedRunId={selectedRunId}
            selectedCaseId={selectedCaseId}
            onSelectRun={setSelectedRunId}
            onSelectCell={(caseId, runId) => {
              setSelectedCaseId(caseId);
              setSelectedRunId(runId);
            }}
          />
        </div>
      ) : null}

      {selectedResult ? (
        <ul>
          <EvalCaseRow result={selectedResult} />
        </ul>
      ) : selectedRunId && runDetail.data?.summaryJson ? (
        <p className="text-xs text-muted-foreground">
          Run {selectedRunId.slice(0, 8)}… — {runDetail.data.summaryJson.passedCases}/
          {runDetail.data.summaryJson.caseCount} passed · avg {runDetail.data.summaryJson.averageScore}%.
          Click a cell for case criteria.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Click a heatmap cell to inspect a case without leaving Observatory.
        </p>
      )}
    </div>
  );
}
