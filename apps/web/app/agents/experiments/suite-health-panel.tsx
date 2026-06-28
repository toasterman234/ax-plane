'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SuiteHealthReport } from '@/lib/experiments-types';
import { cn } from '@/lib/utils';

type SuiteHealthPanelProps = {
  suiteId: string;
  agentId: string;
};

function statusClass(status: string | null): string {
  if (status === 'passed') return 'text-emerald-400';
  if (!status) return 'text-muted-foreground';
  return 'text-red-400';
}

export function SuiteHealthPanel({ suiteId, agentId }: SuiteHealthPanelProps) {
  const health = useQuery({
    queryKey: ['experiments-suite-health', suiteId, agentId],
    queryFn: () => {
      const params = new URLSearchParams({ suiteId, windowDays: '30' });
      if (agentId) params.set('agentId', agentId);
      return api<SuiteHealthReport>(`/experiments/suite-health?${params.toString()}`);
    },
    enabled: Boolean(suiteId),
  });

  if (!suiteId) {
    return <p className="text-sm text-muted-foreground">Select a suite filter to view case health.</p>;
  }

  if (health.isLoading) return <p className="text-sm text-muted-foreground">Loading suite health…</p>;
  if (health.isError) {
    return (
      <p className="text-sm text-red-400">
        {health.error instanceof Error ? health.error.message : 'Failed to load suite health'}
      </p>
    );
  }
  if (!health.data) return null;

  if (health.data.runCount === 0) {
    return <p className="text-sm text-muted-foreground">No finished eval runs in the last 30 days for this suite.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {health.data.runCount} finished run{health.data.runCount === 1 ? '' : 's'} in the last {health.data.windowDays} days.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Case</th>
              <th className="py-2 pr-3">Latest</th>
              <th className="py-2 pr-3">Pass rate</th>
              <th className="py-2 pr-3">Runs</th>
              <th className="py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {health.data.cases.map((row) => (
              <tr
                key={row.caseId}
                className={cn(
                  'border-b border-border/50',
                  row.regressionFlag && 'bg-red-950/20',
                )}
              >
                <td className="py-2 pr-3 font-medium text-foreground">{row.name}</td>
                <td className="py-2 pr-3">
                  <span className={statusClass(row.latestStatus)}>{row.latestStatus ?? '—'}</span>
                  {row.latestScore != null ? (
                    <span className="ml-2 font-mono text-foreground">{row.latestScore}%</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 font-mono text-foreground">{row.passRate}%</td>
                <td className="py-2 pr-3 text-muted-foreground">{row.runCount}</td>
                <td className="py-2 text-xs">
                  {row.regressionFlag ? <span className="text-red-400">Regression</span> : null}
                  {row.flakyFlag ? (
                    <span className={row.regressionFlag ? 'ml-2 text-amber-400' : 'text-amber-400'}>Flaky</span>
                  ) : null}
                  {!row.regressionFlag && !row.flakyFlag ? <span className="text-muted-foreground">—</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
