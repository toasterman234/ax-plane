'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_AGENT_ID } from '@/lib/constants';
import type { ExperimentKind, ExperimentTimelineItem } from '@/lib/experiments-types';
import type { AgentRow, EvalSuite } from '@/lib/eval-types';
import { Card } from '@/components/ui/card';
import { ExperimentsFilters } from './experiments-filters';
import { ExperimentsTimeline } from './experiments-timeline';
import { ExperimentsCompare } from './experiments-compare';
import { SuiteHealthPanel } from './suite-health-panel';

type Tab = 'timeline' | 'compare' | 'health';

export default function ExperimentsPage() {
  const [tab, setTab] = useState<Tab>('timeline');
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [suiteId, setSuiteId] = useState('');
  const [kind, setKind] = useState<ExperimentKind | ''>('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<AgentRow[]>('/agents') });
  const suites = useQuery({ queryKey: ['eval-suites'], queryFn: () => api<EvalSuite[]>('/eval/suites') });

  const timeline = useQuery({
    queryKey: ['experiments-timeline', agentId, suiteId, kind],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (agentId) params.set('agentId', agentId);
      if (suiteId) params.set('suiteId', suiteId);
      if (kind) params.set('kind', kind);
      return api<{ items: ExperimentTimelineItem[] }>(`/experiments/timeline?${params.toString()}`);
    },
  });

  const tabs = useMemo(
    () => ([
      ['timeline', 'Timeline'],
      ['compare', `Compare${selectedRunIds.length ? ` (${selectedRunIds.length})` : ''}`],
      ['health', 'Suite health'],
    ] as const),
    [selectedRunIds.length],
  );

  function toggleRun(runId: string, itemKind: ExperimentTimelineItem['kind']) {
    if (itemKind !== 'eval') return;
    setSelectedRunIds((current) => (
      current.includes(runId)
        ? current.filter((id) => id !== runId)
        : [...current, runId]
    ));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Experiments</h1>
        <p className="text-sm text-muted-foreground">
          Unified view of eval runs, optimization activity, and dispatcher routing evals. Read-only analysis — run optimize and promote from Agent Lab.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <ExperimentsFilters
          agentId={agentId}
          suiteId={suiteId}
          kind={kind}
          agents={agents.data ?? []}
          suites={suites.data ?? []}
          onAgentIdChange={setAgentId}
          onSuiteIdChange={setSuiteId}
          onKindChange={setKind}
        />
      </Card>

      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="p-4">
        {tab === 'timeline' ? (
          timeline.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading timeline…</p>
          ) : timeline.isError ? (
            <p className="text-sm text-red-400">
              {timeline.error instanceof Error ? timeline.error.message : 'Failed to load timeline'}
            </p>
          ) : (
            <ExperimentsTimeline
              items={timeline.data?.items ?? []}
              selectedRunIds={selectedRunIds}
              onToggleRun={toggleRun}
            />
          )
        ) : null}

        {tab === 'compare' ? (
          <ExperimentsCompare runIds={selectedRunIds} />
        ) : null}

        {tab === 'health' ? (
          <SuiteHealthPanel suiteId={suiteId || suites.data?.[0]?.id || ''} agentId={agentId} />
        ) : null}
      </Card>
    </div>
  );
}
