'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type DispatcherCaseSummary = {
  id: string;
  rationale: string;
  prompt: string;
  slow?: boolean;
  path: string;
  expectFirst?: string | null;
  expectAny?: string[];
};

type ReplaySession = {
  runId: string;
  caseId: string;
  prompt?: string;
  expectFirst?: string | null;
  expectAny?: string[];
  status: 'running' | 'passed' | 'failed' | 'error';
  failureReason: string | null;
};

function expectLabel(c: DispatcherCaseSummary) {
  if (c.expectFirst !== undefined && c.expectFirst !== null) return `first: ${c.expectFirst}`;
  if (c.expectAny?.length) return `any: ${c.expectAny.join(', ')}`;
  if (c.path === 'short-circuit') return 'short-circuit';
  return 'direct OK';
}

export function ObservatoryRoutingEvalPanel({
  activeRunId,
  onReplayStarted,
}: {
  activeRunId?: string | null;
  onReplayStarted: (session: Pick<ReplaySession, 'runId' | 'caseId'>) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const cases = useQuery({
    queryKey: ['flow-trace-cases'],
    queryFn: () => api<DispatcherCaseSummary[]>('/api/flow-trace/cases'),
    retry: false,
  });

  const replays = useQuery({
    queryKey: ['flow-trace-replays'],
    queryFn: () => api<ReplaySession[]>('/api/flow-trace/replays?limit=30'),
    refetchInterval: 5000,
  });

  const replayByCase = new Map<string, ReplaySession>();
  for (const row of replays.data ?? []) {
    if (!replayByCase.has(row.caseId) || row.runId === activeRunId) {
      replayByCase.set(row.caseId, row);
    }
  }

  const startReplay = useMutation({
    mutationFn: (body: { caseId: string; includeSlow?: boolean }) =>
      api<ReplaySession>('/api/flow-trace/replay', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async (session) => {
      setError(null);
      onReplayStarted(session);
      await queryClient.invalidateQueries({ queryKey: ['flow-trace-replays'] });
      router.replace(`/observatory?runId=${encodeURIComponent(session.runId)}&caseId=${encodeURIComponent(session.caseId)}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Replay failed');
    },
  });

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-semibold">Routing eval replay</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Re-run ax-sandbox routing cases live against :8810 and paint the path on the canvas (
          <a
            href="https://github.com/toasterman234/ax-plane/issues/6"
            className="text-sky-400 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            #6
          </a>
          ).
        </p>
      </div>

      {cases.isError ? (
        <p className="text-sm text-amber-400">
          Cases unavailable — set <code className="text-xs">AX_SANDBOX_ROOT</code> and ensure ax-sandbox evals exist.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="max-h-64 overflow-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-card text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2">Case</th>
              <th className="px-2 py-2">Expect</th>
              <th className="px-2 py-2">Last</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {(cases.data ?? []).map((c) => {
              const last = replayByCase.get(c.id);
              const isActive = last?.runId === activeRunId;
              return (
                <tr key={c.id} className={`border-b border-border/60 align-top ${isActive ? 'bg-muted/30' : ''}`}>
                  <td className="px-2 py-2">
                    <div className="font-mono text-xs">{c.id}</div>
                    <div className="text-muted-foreground">{c.rationale}</div>
                    {c.slow ? <span className="text-xs text-amber-400">slow</span> : null}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{expectLabel(c)}</td>
                  <td className="px-2 py-2 text-xs">
                    {last ? (
                      <span
                        className={
                          last.status === 'passed'
                            ? 'text-emerald-400'
                            : last.status === 'running'
                              ? 'text-sky-400'
                              : 'text-red-400'
                        }
                      >
                        {last.status}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      className="h-7 px-2 text-xs"
                      disabled={startReplay.isPending}
                      onClick={() =>
                        startReplay.mutate({ caseId: c.id, includeSlow: Boolean(c.slow) })
                      }
                    >
                      Replay
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
