'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  axFlowScorePct,
  type AxFlowEvalHistory,
  type AxFlowEvalRun,
  type AxFlowTestCase,
  type AxFlowTestSet,
} from '@axplane/eval/ax-flow-evals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';

type View = 'summary' | 'results' | 'testset';

function ScoreDelta({ score, prev }: { score: number; prev?: number }) {
  if (prev == null) return null;
  const delta = axFlowScorePct(score) - axFlowScorePct(prev);
  if (delta === 0) return <span className="text-xs text-muted-foreground">no change</span>;
  return (
    <span className={`text-xs ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}%
    </span>
  );
}

function CaseResult({ c }: { c: AxFlowEvalRun['cases'][number] }) {
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-xs">
        <span className={c.ok ? 'text-emerald-400' : 'text-red-400'}>{c.ok ? 'pass' : 'fail'}</span>
        <span className="truncate font-medium">{c.input}</span>
      </div>
      <div className="space-y-2 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">expected: </span>
          {c.expected}
        </div>
        <div>
          <span className="text-muted-foreground">got: </span>
          <span className="whitespace-pre-wrap">{c.got}</span>
        </div>
        {!c.ok && c.failReason ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-400">
            {c.failReason}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Observatory Slice F — LLM-judge evals for one ax-flow (Studio `/api/evals` parity).
 */
export function AxFlowEvalsPanel({ flowId, stageCount }: { flowId: string; stageCount: number }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('summary');
  const [draftCases, setDraftCases] = useState<AxFlowTestCase[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['ax-flow-evals', flowId],
    queryFn: () => api<AxFlowEvalHistory>(`/ax-flow-evals?flow=${encodeURIComponent(flowId)}`),
  });

  const testSet = useQuery({
    queryKey: ['ax-flow-testset', flowId],
    queryFn: () => api<AxFlowTestSet>(`/ax-flow-evals?flow=${encodeURIComponent(flowId)}&testset=1`),
  });

  const cases = draftCases ?? testSet.data?.cases ?? [];
  const latest = history.data?.latest ?? null;

  const saveTestSet = useMutation({
    mutationFn: (body: AxFlowTestSet) =>
      api<AxFlowTestSet>('/ax-flow-evals', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['ax-flow-testset', flowId], saved);
      setDraftCases(null);
      setDirty(false);
      setLocalError(null);
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to save test set');
    },
  });

  const runEvals = useMutation({
    mutationFn: async () => {
      const planRes = await api<{ plan: { cases: number; callsPerCase: number; totalCalls: number } }>(
        `/ax-flow-evals?flow=${encodeURIComponent(flowId)}&plan=1`,
        { method: 'POST' },
      );
      const { plan } = planRes;
      const ok = window.confirm(
        `Run LLM-judge evals for "${flowId}"?\n\n` +
          `~${plan.totalCalls} LLM calls (${plan.cases} cases × ${plan.callsPerCase} each).\n` +
          `Runs on the shared ax-server account.`,
      );
      if (!ok) throw new Error('cancelled');
      return api<AxFlowEvalRun>(`/ax-flow-evals?flow=${encodeURIComponent(flowId)}`, { method: 'POST' });
    },
    onSuccess: (run) => {
      queryClient.setQueryData(['ax-flow-evals', flowId], (prev: AxFlowEvalHistory | undefined) => ({
        latest: run,
        runs: [run, ...(prev?.runs ?? [])],
      }));
      setView('results');
      setLocalError(null);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'cancelled') return;
      setLocalError(err instanceof Error ? err.message : 'Eval run failed');
    },
  });

  const updateCase = useCallback((id: string, field: 'input' | 'expected', value: string) => {
    setDraftCases((prev) => {
      const base = prev ?? testSet.data?.cases ?? [];
      return base.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    });
    setDirty(true);
  }, [testSet.data?.cases]);

  const removeCase = useCallback((id: string) => {
    setDraftCases((prev) => (prev ?? testSet.data?.cases ?? []).filter((c) => c.id !== id));
    setDirty(true);
  }, [testSet.data?.cases]);

  const addCase = useCallback(() => {
    setDraftCases((prev) => {
      const base = prev ?? testSet.data?.cases ?? [];
      return [...base, { id: `new-${base.length + 1}`, input: '', expected: '' }];
    });
    setDirty(true);
  }, [testSet.data?.cases]);

  const fallbackPlan = useMemo(
    () => ({ cases: cases.length, callsPerCase: stageCount + 1, totalCalls: cases.length * (stageCount + 1) }),
    [cases.length, stageCount],
  );

  const loading = history.isLoading || testSet.isLoading;
  const fetchError = history.error ?? testSet.error;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">LLM-judge evals</h3>
          <p className="text-xs text-muted-foreground">
            Plain-English expectations graded by ax-server judge (Slice F).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="px-2 py-1 text-xs"
            disabled={runEvals.isPending || cases.length === 0}
            onClick={() => runEvals.mutate()}
          >
            {runEvals.isPending ? 'Running…' : 'Run evals'}
          </Button>
          <Button
            className="bg-secondary px-2 py-1 text-xs text-secondary-foreground"
            onClick={() => setView(view === 'testset' ? 'summary' : 'testset')}
          >
            {view === 'testset' ? 'Back' : `Test set (${cases.length})`}
          </Button>
          {latest ? (
            <Button
              className="bg-secondary px-2 py-1 text-xs text-secondary-foreground"
              onClick={() => setView('results')}
            >
              Results
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading eval data…</p> : null}
      {fetchError ? (
        <p className="text-sm text-red-400">
          {fetchError instanceof Error ? fetchError.message : 'Failed to load eval data'}
        </p>
      ) : null}
      {localError ? <p className="text-sm text-red-400">{localError}</p> : null}

      {view === 'summary' && !loading ? (
        <div className="space-y-2">
          {latest ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{axFlowScorePct(latest.score)}%</span>
                <span className="text-xs text-muted-foreground">
                  {latest.passed}/{latest.total} cases
                </span>
                <ScoreDelta score={latest.score} prev={latest.prevScore} />
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {latest.checks.map((check) => (
                  <span key={check.id} className={check.passed === check.total ? 'text-emerald-400' : 'text-red-400'}>
                    {check.label} {check.passed}/{check.total}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {cases.length > 0
                ? `No eval runs yet. ~${fallbackPlan.totalCalls} LLM calls if you run now.`
                : 'No test cases yet — add cases in the test set, then run evals.'}
            </p>
          )}
        </div>
      ) : null}

      {view === 'results' && latest ? (
        <div className="max-h-80 space-y-2 overflow-auto">
          {latest.cases.map((c) => (
            <CaseResult key={c.id} c={c} />
          ))}
        </div>
      ) : null}

      {view === 'testset' ? (
        <div className="space-y-3">
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Each case is input + plain-English expected. An LLM judge on ax-server decides pass/fail.
          </p>
          <div className="max-h-72 space-y-2 overflow-auto">
            {cases.map((c) => (
              <div key={c.id} className="rounded-md border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
                  <span className="font-mono">{c.id}</span>
                  <button type="button" className="ml-auto text-red-400 hover:underline" onClick={() => removeCase(c.id)}>
                    remove
                  </button>
                </div>
                <div className="space-y-2 p-3">
                  <textarea
                    value={c.input}
                    onChange={(e) => updateCase(c.id, 'input', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                    placeholder="input…"
                  />
                  <textarea
                    value={c.expected}
                    onChange={(e) => updateCase(c.id, 'expected', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                    placeholder="what a good answer must satisfy…"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-secondary px-2 py-1 text-xs text-secondary-foreground"
              onClick={addCase}
            >
              Add case
            </Button>
            <Button
              className="px-2 py-1 text-xs"
              disabled={!dirty || saveTestSet.isPending}
              onClick={() =>
                saveTestSet.mutate({ flowId, cases: draftCases ?? testSet.data?.cases ?? [] })
              }
            >
              {saveTestSet.isPending ? 'Saving…' : dirty ? 'Save test set' : 'Saved'}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
