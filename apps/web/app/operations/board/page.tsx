'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BoardKanban } from './board-kanban';
import type { OperationsBoardResponse } from './board-types';

type Agent = { id: string; name: string; enabled: boolean };
type Run = { id: string; requestId: string; agentId: string; status: string };

export default function OperationsBoardPage() {
  const queryClient = useQueryClient();
  const [agentFilter, setAgentFilter] = useState('');
  const [runKindFilter, setRunKindFilter] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [newBody, setNewBody] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingRequestId, setStartingRequestId] = useState<string | null>(null);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    if (agentFilter) params.set('agentId', agentFilter);
    if (runKindFilter) params.set('runKind', runKindFilter);
    if (attentionOnly) params.set('attention', 'true');
    const qs = params.toString();
    return qs ? `/operations/board?${qs}` : '/operations/board';
  }, [agentFilter, runKindFilter, attentionOnly]);

  const board = useQuery({
    queryKey: ['operations-board', queryPath],
    queryFn: () => api<OperationsBoardResponse>(queryPath),
    refetchInterval: 3000,
  });

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Agent[]>('/agents'),
  });

  const invalidateBoard = () => {
    void queryClient.invalidateQueries({ queryKey: ['operations-board'] });
    void queryClient.invalidateQueries({ queryKey: ['approvals', 'pending-count'] });
    void queryClient.invalidateQueries({ queryKey: ['operations-board-badge'] });
  };

  const createRequest = useMutation({
    mutationFn: () => api<{ request: { id: string }; run?: Run }>('/requests', {
      method: 'POST',
      body: JSON.stringify({ body: newBody, autoStart: false }),
    }),
    onSuccess: () => {
      setError(null);
      setMessage('Request submitted — drag it to Queued or Running to start, or use Start run.');
      setNewBody('');
      setShowComposer(false);
      invalidateBoard();
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Submit failed');
    },
  });

  async function startRun(requestId: string) {
    setStartingRequestId(requestId);
    setError(null);
    try {
      const run = await api<Run>('/runs', {
        method: 'POST',
        body: JSON.stringify({ requestId }),
      });
      invalidateBoard();
      window.location.href = `/runs/${run.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setStartingRequestId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Agent</span>
            <select
              className="rounded-md border border-border bg-muted px-2 py-1"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <option value="">All</option>
              {(agents.data ?? []).filter((agent) => agent.enabled).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Run kind</span>
            <select
              className="rounded-md border border-border bg-muted px-2 py-1"
              value={runKindFilter}
              onChange={(e) => setRunKindFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="agent">Agent</option>
              <option value="graph">Graph</option>
              <option value="axflow">AX Flow</option>
              <option value="axdispatcher">Dispatcher</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-foreground">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(e) => setAttentionOnly(e.target.checked)}
            />
            Needs attention only
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {board.data ? (
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {board.data.counts.total} cards · {board.data.counts.activeRuns} active · {board.data.counts.pendingApprovals} approvals
            </p>
          ) : null}
          <Button
            className="shrink-0 whitespace-nowrap bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={() => setShowComposer((value) => !value)}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            New request
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag cards from <strong>Inbox</strong> or <strong>Ready</strong> onto <strong>Queued</strong> or <strong>Running</strong> to start a run — or use the Start run button.
      </p>

      {showComposer ? (
        <Card className="space-y-3 p-4">
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-card p-3 text-sm"
            placeholder="Describe the work…"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending || !newBody.trim()}>
              {createRequest.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
            <Button
              className="bg-secondary text-secondary-foreground hover:opacity-90"
              onClick={() => setShowComposer(false)}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {board.isError ? (
        <p className="text-sm text-red-400">Could not load board from {API_URL}</p>
      ) : null}

      {board.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading board…</p>
      ) : board.data ? (
        <BoardKanban
          columns={board.data.columns}
          onStartRun={startRun}
          startingRequestId={startingRequestId}
        />
      ) : null}
    </div>
  );
}
