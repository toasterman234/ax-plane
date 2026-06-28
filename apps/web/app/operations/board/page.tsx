'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BoardKanban } from './board-kanban';
import { BoardKpiStrip } from './board-kpi-strip';
import { BoardListView } from './board-list';
import { BoardInspectPanel } from './board-inspect-panel';
import { flattenBoardCards, type BoardCard } from './board-types';
import { useOperationsBoardStream } from './use-operations-board-stream';

type Agent = { id: string; name: string; enabled: boolean };
type Run = { id: string; requestId: string; agentId: string; status: string };
type BoardView = 'kanban' | 'list';

type SelectedInspect = {
  card: BoardCard;
  columnId: string;
  columnLabel: string;
};

const VIEW_STORAGE_KEY = 'axplane-operations-board-view';

function loadViewPreference(): BoardView {
  if (typeof window === 'undefined') return 'kanban';
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'kanban';
}

export default function OperationsBoardPage() {
  const queryClient = useQueryClient();
  const [agentFilter, setAgentFilter] = useState('');
  const [runKindFilter, setRunKindFilter] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [hideEmptyColumns, setHideEmptyColumns] = useState(true);
  const [view, setView] = useState<BoardView>('kanban');
  const [newBody, setNewBody] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingRequestId, setStartingRequestId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedInspect | null>(null);

  useEffect(() => {
    setView(loadViewPreference());
  }, []);

  function setBoardView(next: BoardView) {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    if (agentFilter) params.set('agentId', agentFilter);
    if (runKindFilter) params.set('runKind', runKindFilter);
    if (attentionOnly) params.set('attention', 'true');
    const qs = params.toString();
    return qs ? `/operations/board?${qs}` : '/operations/board';
  }, [agentFilter, runKindFilter, attentionOnly]);

  const board = useOperationsBoardStream(queryPath);

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Agent[]>('/agents'),
  });

  const listCards = useMemo(
    () => (board.data ? flattenBoardCards(board.data.columns) : []),
    [board.data],
  );

  const invalidateBoard = () => {
    void queryClient.invalidateQueries({ queryKey: ['operations-board'] });
    void queryClient.invalidateQueries({ queryKey: ['approvals', 'pending-count'] });
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
      setSelected(null);
      window.location.href = `/runs/${run.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setStartingRequestId(null);
    }
  }

  function openInspect(card: BoardCard, columnId: string, columnLabel?: string) {
    const label =
      columnLabel ??
      board.data?.columns.find((column) => column.id === columnId)?.label ??
      columnId;
    setSelected({ card, columnId, columnLabel: label });
  }

  useEffect(() => {
    if (!selected || !board.data) return;
    for (const column of board.data.columns) {
      const fresh = column.cards.find((card) => card.requestId === selected.card.requestId);
      if (fresh) {
        setSelected({
          card: fresh,
          columnId: column.id,
          columnLabel: column.label,
        });
        return;
      }
    }
  }, [board.data, selected?.card.requestId]);

  return (
    <div className="space-y-4">
      {board.data ? (
        <BoardKpiStrip columns={board.data.columns} counts={board.data.counts} />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                view === 'kanban' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setBoardView('kanban')}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              Kanban
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                view === 'list' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setBoardView('list')}
            >
              <List className="h-3.5 w-3.5" aria-hidden />
              List
            </button>
          </div>

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
            Needs attention
          </label>
          {view === 'kanban' ? (
            <label className="flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={hideEmptyColumns}
                onChange={(e) => setHideEmptyColumns(e.target.checked)}
              />
              Hide empty columns
            </label>
          ) : null}
        </div>

        <Button
          className="shrink-0 whitespace-nowrap bg-secondary text-secondary-foreground hover:opacity-90"
          onClick={() => setShowComposer((value) => !value)}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          New request
        </Button>
      </div>

      {view === 'kanban' ? (
        <p className="text-xs text-muted-foreground">
          Drag from <strong>Inbox</strong> or <strong>Ready</strong> onto <strong>Queued</strong> or <strong>Running</strong> to start — or use Start run.
        </p>
      ) : null}

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
        view === 'kanban' ? (
          <BoardKanban
            columns={board.data.columns}
            onStartRun={startRun}
            startingRequestId={startingRequestId}
            hideEmptyColumns={hideEmptyColumns}
            onInspect={(card, columnId) => openInspect(card, columnId)}
          />
        ) : (
          <BoardListView
            cards={listCards}
            onStartRun={startRun}
            startingRequestId={startingRequestId}
            onInspect={(card) => openInspect(card, card.columnId, card.columnLabel)}
          />
        )
      ) : null}

      {selected ? (
        <BoardInspectPanel
          card={selected.card}
          columnId={selected.columnId}
          columnLabel={selected.columnLabel}
          onClose={() => setSelected(null)}
          onStartRun={startRun}
          starting={startingRequestId === selected.card.requestId}
        />
      ) : null}
    </div>
  );
}
