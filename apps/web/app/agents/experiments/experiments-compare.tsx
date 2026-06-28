'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ExperimentCompareResult } from '@/lib/experiments-types';
import { CaseHeatmap } from '@/components/eval/case-heatmap';
import { Card } from '@/components/ui/card';

type ExperimentsCompareProps = {
  runIds: string[];
};

export function ExperimentsCompare({ runIds }: ExperimentsCompareProps) {
  const compare = useQuery({
    queryKey: ['experiments-compare', runIds.join(',')],
    queryFn: () => api<ExperimentCompareResult>(`/experiments/compare?runIds=${encodeURIComponent(runIds.join(','))}`),
    enabled: runIds.length >= 2,
  });

  if (runIds.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Select at least two eval runs from the Timeline tab to compare case scores side-by-side.
      </p>
    );
  }

  if (compare.isLoading) return <p className="text-sm text-muted-foreground">Loading comparison…</p>;
  if (compare.isError) {
    return (
      <p className="text-sm text-red-400">
        {compare.error instanceof Error ? compare.error.message : 'Comparison failed'}
      </p>
    );
  }
  if (!compare.data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {compare.data.runs.map((run) => (
          <Card key={run.id} className="p-3 text-sm">
            <div className="font-medium text-foreground">{new Date(run.createdAt).toLocaleString()}</div>
            <div className="text-muted-foreground">{run.mode} · {run.status}</div>
            {run.summary ? (
              <div className="mt-1 text-foreground">
                {run.summary.passedCases}/{run.summary.caseCount} passed · avg {run.summary.averageScore}%
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {compare.data.scoreSpread ? (
        <p className="text-sm text-muted-foreground">
          Score spread: {compare.data.scoreSpread.min}% – {compare.data.scoreSpread.max}%
          {' '}(Δ {compare.data.scoreSpread.delta}%)
        </p>
      ) : null}
      <CaseHeatmap matrix={compare.data.matrix} />
    </div>
  );
}
