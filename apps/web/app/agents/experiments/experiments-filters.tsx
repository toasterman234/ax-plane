'use client';

import type { ExperimentKind } from '@/lib/experiments-types';
import type { AgentRow, EvalSuite } from '@/lib/eval-types';

type ExperimentsFiltersProps = {
  agentId: string;
  suiteId: string;
  kind: ExperimentKind | '';
  agents: AgentRow[];
  suites: EvalSuite[];
  onAgentIdChange: (value: string) => void;
  onSuiteIdChange: (value: string) => void;
  onKindChange: (value: ExperimentKind | '') => void;
};

export function ExperimentsFilters({
  agentId,
  suiteId,
  kind,
  agents,
  suites,
  onAgentIdChange,
  onSuiteIdChange,
  onKindChange,
}: ExperimentsFiltersProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm text-foreground">
        Agent
        <select
          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          value={agentId}
          onChange={(e) => onAgentIdChange(e.target.value)}
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm text-foreground">
        Suite
        <select
          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          value={suiteId}
          onChange={(e) => onSuiteIdChange(e.target.value)}
        >
          <option value="">All suites</option>
          {suites.map((suite) => (
            <option key={suite.id} value={suite.id}>{suite.name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm text-foreground">
        Kind
        <select
          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => onKindChange(e.target.value as ExperimentKind | '')}
        >
          <option value="">All activity</option>
          <option value="eval">Eval runs</option>
          <option value="optimization">Optimization</option>
          <option value="dispatcher">Dispatcher eval</option>
        </select>
      </label>
    </div>
  );
}
