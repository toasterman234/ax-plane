'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FlowEntry } from '@axplane/flow-canvas';
import {
  groupFlowCatalogEntries,
  matchesCatalogFilter,
  patternLabel,
  resolvePatternSource,
  type FlowCatalogFilter,
} from '@axplane/flow-canvas';
import { api, API_URL } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { AxFlowDetailPanel } from '../ax-flow-detail-panel';

type AxFlowsResponse = {
  flows: FlowEntry[];
  engineReachable: boolean;
  axServerUrl: string;
};

const FILTERS: { id: FlowCatalogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'corpus', label: 'Patterns' },
  { id: 'custom', label: 'Custom' },
  { id: 'builder', label: 'Builder' },
];

function FlowListButton({
  flow,
  active,
  onSelect,
}: {
  flow: FlowEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const source = resolvePatternSource(flow);
  const pattern = patternLabel(flow.pattern);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
        active
          ? 'border-sky-700 bg-sky-950/30 text-foreground'
          : 'border-border text-foreground hover:border-border'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{flow.title || flow.id}</span>
        {pattern ? (
          <span className="rounded bg-violet-950/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-300">
            {pattern}
          </span>
        ) : null}
        {source === 'builder' ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            builder
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{flow.id}</div>
      {flow.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{flow.summary}</p> : null}
    </button>
  );
}

function FlowListSection({
  title,
  flows,
  activeId,
  onSelect,
}: {
  title: string;
  flows: FlowEntry[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (flows.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {flows.map((flow) => (
        <FlowListButton
          key={flow.id}
          flow={flow}
          active={flow.id === activeId}
          onSelect={() => onSelect(flow.id)}
        />
      ))}
    </div>
  );
}

export default function AxFlowsTabPage() {
  const [selectedId, setSelectedId] = useState<string>('');
  const [filter, setFilter] = useState<FlowCatalogFilter>('all');

  const catalog = useQuery({
    queryKey: ['ax-flows'],
    queryFn: () => api<AxFlowsResponse>('/ax-flows'),
    retry: false,
  });

  const health = useQuery({
    queryKey: ['health-ax-engine'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
      const data = (await res.json()) as { axEngine?: { reachable: boolean; flowCount: number; url: string } };
      return data.axEngine;
    },
    retry: false,
  });

  const allFlows = catalog.data?.flows ?? [];

  const filteredFlows = useMemo(
    () => allFlows.filter((flow) => matchesCatalogFilter(flow, filter)),
    [allFlows, filter],
  );

  const { corpus, other } = useMemo(() => groupFlowCatalogEntries(filteredFlows), [filteredFlows]);

  const activeId = selectedId || filteredFlows[0]?.id || allFlows[0]?.id || '';
  const active = useMemo(
    () => allFlows.find((f) => f.id === activeId) ?? null,
    [allFlows, activeId],
  );

  const showGrouped = filter === 'all' && corpus.length > 0 && other.length > 0;

  return (
    <div className="space-y-6">
      {catalog.isLoading ? <p className="text-sm text-muted-foreground">Loading flow catalog…</p> : null}
      {catalog.error ? (
        <p className="text-sm text-red-400">
          {catalog.error instanceof Error ? catalog.error.message : 'Failed to load ax-flows'}
        </p>
      ) : null}

      {!catalog.isLoading && allFlows.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          <p>No flows returned from the engine.</p>
          <p className="mt-2">
            Start ax-server in ax-sandbox (<code className="text-xs">pnpm server</code>, port{' '}
            {catalog.data?.axServerUrl ?? health.data?.url ?? '8810'}) and refresh.
          </p>
          {health.data && !health.data.reachable ? (
            <p className="mt-2 text-amber-400/90">
              API health: ax-server at {health.data.url} is not reachable ({health.data.flowCount} flows).
            </p>
          ) : null}
          <p className="mt-2">
            Graph child-runs live under the{' '}
            <Link href="/workflows" className="text-sky-400 hover:underline">
              Graph
            </Link>{' '}
            tab. Pattern docs:{' '}
            <code className="text-xs">docs/patterns/README.md</code> in the ax-plane repo.
          </p>
        </Card>
      ) : null}

      {allFlows.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="max-h-[80vh] space-y-3 overflow-y-auto p-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    filter === chip.id
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredFlows.length} of {allFlows.length} flow{allFlows.length === 1 ? '' : 's'}
              {filter === 'corpus' ? ' · corpus orchestration patterns' : ''}
            </p>

            {filteredFlows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flows in this filter.</p>
            ) : showGrouped ? (
              <>
                <FlowListSection
                  title="Orchestration patterns"
                  flows={corpus}
                  activeId={activeId}
                  onSelect={setSelectedId}
                />
                <FlowListSection title="Other flows" flows={other} activeId={activeId} onSelect={setSelectedId} />
              </>
            ) : (
              <FlowListSection
                title={filter === 'corpus' ? 'Orchestration patterns' : 'Flows'}
                flows={filteredFlows}
                activeId={activeId}
                onSelect={setSelectedId}
              />
            )}
          </Card>

          {active ? <AxFlowDetailPanel flow={active} /> : null}
        </div>
      ) : null}
    </div>
  );
}
