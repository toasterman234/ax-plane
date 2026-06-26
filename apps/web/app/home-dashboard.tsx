'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_AGENT_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type DashboardSummary = {
  health: {
    worker?: { ok?: boolean; mode?: string };
    axEngine?: { reachable: boolean; flowCount: number; dispatcherAvailable?: boolean };
    router?: { executionMode?: string };
  };
  counts: {
    agents: number;
    workflows: number;
    requests: number;
    pendingApprovals: number;
    activeRuns: number;
  };
  setup: {
    hasDefaultAgent: boolean;
    hasRequest: boolean;
    hasCompletedRun: boolean;
    hasApprovalFlow: boolean;
    complete: boolean;
    doneCount: number;
    totalSteps: number;
  };
  recentRuns: Array<{ id: string; agentId: string; status: string; createdAt: string }>;
  attention: Array<{ key: string; text: string; href: string; cta: string }>;
};

type RequestRow = { id: string; body: string; createdAt: string };
type Workflow = { id: string; name: string };
type RouteDecision = { selectedAgentId: string; reason: string; strategy: string };

const APPROVAL_DEMO_BODY =
  'Create a short plan and use the fake risky tool so I can test approvals.';

const SUMMARY_KEY = ['dashboard-summary'] as const;

function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
        ok ? 'border-emerald-900/40 bg-emerald-950/20' : 'border-amber-900/40 bg-amber-950/20'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
      <span className="font-medium">{label}</span>
      {detail ? <span className="text-muted-foreground">{detail}</span> : null}
    </span>
  );
}

function runStatusClass(status: string) {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'failed' || status === 'cancelled') return 'text-red-400';
  if (status === 'needs_approval') return 'text-amber-400';
  return 'text-muted-foreground';
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
  );
}

export function HomeDashboard() {
  const queryClient = useQueryClient();
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 5000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });

  const seedAgent = useMutation({
    mutationFn: () => api('/agents/seed-default', { method: 'POST' }),
    onSuccess: () => {
      setSeedError(null);
      setSeedMessage(`Default agent ready: ${DEFAULT_AGENT_ID}`);
      invalidate();
    },
    onError: (err) => {
      setSeedMessage(null);
      setSeedError(err instanceof Error ? err.message : 'Failed to install default agent');
    },
  });

  const createRequest = useMutation({
    mutationFn: (payload: { body: string; autoStart: boolean }) =>
      api<{ request: RequestRow; run?: { id: string }; routeDecision: RouteDecision }>('/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      setQuickError(null);
      setQuickMessage(
        data.run
          ? `Routed to ${data.routeDecision.selectedAgentId} — run ${data.run.id.slice(0, 8)}… started`
          : `Routed to ${data.routeDecision.selectedAgentId}: ${data.routeDecision.reason}`,
      );
      invalidate();
      if (data.run) window.location.href = `/runs/${data.run.id}`;
    },
    onError: (err) => {
      setQuickMessage(null);
      setQuickError(err instanceof Error ? err.message : 'Submit failed');
    },
  });

  const seedWorkflow = useMutation({
    mutationFn: () => api<Workflow>('/workflows/seed-default', { method: 'POST' }),
    onSuccess: (workflow) => {
      setQuickError(null);
      setQuickMessage(`Sample workflow ready: ${workflow.name}`);
      invalidate();
    },
    onError: (err) => {
      setQuickMessage(null);
      setQuickError(err instanceof Error ? err.message : 'Failed to install sample workflow');
    },
  });

  function submitRequest(body: string, startImmediately = autoStart) {
    const trimmed = body.trim();
    if (!trimmed) return;
    setQuickMessage(null);
    setQuickError(null);
    createRequest.mutate({ body: trimmed, autoStart: startImmediately });
  }

  async function runApprovalDemo() {
    setQuickMessage(null);
    setQuickError(null);
    setRequestBody(APPROVAL_DEMO_BODY);
    if (!summary.data?.setup.hasDefaultAgent) {
      try {
        await api('/agents/seed-default', { method: 'POST' });
        invalidate();
        setSeedMessage(`Default agent ready: ${DEFAULT_AGENT_ID}`);
      } catch (err) {
        setQuickError(err instanceof Error ? err.message : 'Install default agent first');
        return;
      }
    }
    createRequest.mutate({ body: APPROVAL_DEMO_BODY, autoStart: true });
  }

  if (summary.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mission control</h1>
          <p className="mt-1 text-sm text-muted-foreground">Loading dashboard…</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="h-28 animate-pulse bg-muted/30" />
          <Card className="h-28 animate-pulse bg-muted/30" />
        </div>
      </div>
    );
  }

  if (summary.isError || !summary.data) {
    return (
      <Card className="border-red-900/50 bg-red-950/20 p-4 text-sm text-red-200">
        <p className="font-medium">Could not load dashboard summary</p>
        <p className="mt-1">
          {summary.error instanceof Error ? summary.error.message : 'API unreachable — is pnpm dev running?'}
        </p>
      </Card>
    );
  }

  const data = summary.data;
  const worker = data.health.worker;
  const axEngine = data.health.axEngine;
  const executionMode = data.health.router?.executionMode ?? 'mock';
  const stackHealthy = Boolean(worker?.ok);

  const setupSteps = [
    {
      id: 'agent',
      label: 'Install default agent',
      done: data.setup.hasDefaultAgent,
      action: data.setup.hasDefaultAgent ? (
        <Link href="/agents" className="text-sm text-primary underline">
          Open registry
        </Link>
      ) : (
        <Button
          className="bg-secondary text-secondary-foreground hover:opacity-90"
          disabled={seedAgent.isPending}
          onClick={() => seedAgent.mutate()}
        >
          {seedAgent.isPending ? 'Installing…' : 'Install now'}
        </Button>
      ),
    },
    {
      id: 'request',
      label: 'Submit a request',
      done: data.setup.hasRequest,
      action: (
        <Link href="/operations/requests" className="text-sm text-primary underline">
          Open requests
        </Link>
      ),
    },
    {
      id: 'run',
      label: 'Complete a run',
      done: data.setup.hasCompletedRun,
      action: (
        <Link href="/operations/runs" className="text-sm text-primary underline">
          Open runs
        </Link>
      ),
    },
    {
      id: 'approval',
      label: 'Exercise approval flow',
      done: data.setup.hasApprovalFlow,
      action: (
        <Link href="/operations/approvals" className="text-sm text-primary underline">
          Open approvals
        </Link>
      ),
    },
  ];

  const setupPct = Math.round((data.setup.doneCount / data.setup.totalSteps) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mission control</h1>
          <p className="mt-1 text-muted-foreground">
            Stack health, what needs you, and recent activity across Ax Plane.
          </p>
        </div>
        {!data.setup.complete ? (
          <div className="min-w-[180px]">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Setup</span>
              <span>
                {data.setup.doneCount}/{data.setup.totalSteps}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${setupPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className={`space-y-3 ${
            stackHealthy ? 'border-emerald-900/30 bg-emerald-950/10' : 'border-amber-900/30 bg-amber-950/10'
          }`}
        >
          <SectionLabel>System status</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <StatusPill label="API" ok detail="connected" />
            <StatusPill label="Worker" ok={Boolean(worker?.ok)} detail={worker?.mode ?? 'unknown'} />
            <StatusPill label="Execution" ok detail={executionMode} />
            <StatusPill
              label="ax-server"
              ok={Boolean(axEngine?.reachable)}
              detail={
                axEngine?.reachable
                  ? `${axEngine.flowCount} flows${axEngine.dispatcherAvailable ? ' · dispatcher' : ''}`
                  : 'offline'
              }
            />
          </div>
        </Card>

        <Card className="space-y-3">
          <SectionLabel>Needs attention</SectionLabel>
          {data.attention.length === 0 ? (
            <p className="text-sm text-emerald-400/90">All clear — no pending approvals or blocked runs.</p>
          ) : (
            <ul className="space-y-2">
              {data.attention.map((item) => (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-900/30 bg-amber-950/10 px-3 py-2 text-sm"
                >
                  <span>{item.text}</span>
                  <Link href={item.href} className="font-medium text-primary underline">
                    {item.cta}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="space-y-4 border-primary/20">
        <div>
          <SectionLabel>Quick actions</SectionLabel>
          <p className="mt-2 text-sm text-muted-foreground">
            Submit work from Home or run one-click demos without leaving mission control.
          </p>
        </div>
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm"
          placeholder="Describe a task for the router…"
          value={requestBody}
          onChange={(e) => setRequestBody(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-foreground">
            <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
            Start run immediately
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => submitRequest(requestBody)} disabled={createRequest.isPending || !requestBody.trim()}>
            {createRequest.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
          <Button
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={() => runApprovalDemo()}
            disabled={createRequest.isPending}
          >
            Run approval demo
          </Button>
          <Button
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={() => seedWorkflow.mutate()}
            disabled={seedWorkflow.isPending}
          >
            {seedWorkflow.isPending ? 'Installing…' : 'Install sample workflow'}
          </Button>
        </div>
        {quickMessage ? <p className="text-sm text-emerald-400">{quickMessage}</p> : null}
        {quickError ? <p className="text-sm text-red-400">{quickError}</p> : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {!data.setup.complete ? (
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">First-run setup</h2>
              <span className="text-sm text-muted-foreground">
                {data.setup.doneCount}/{data.setup.totalSteps}
              </span>
            </div>
            {seedMessage ? <p className="text-sm text-emerald-400">{seedMessage}</p> : null}
            {seedError ? <p className="text-sm text-red-400">{seedError}</p> : null}
            <ol className="space-y-3">
              {setupSteps.map((step) => (
                <li
                  key={step.id}
                  className={`rounded-md border px-3 py-2 ${
                    step.done ? 'border-emerald-900/40 bg-emerald-950/20' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      <span className={step.done ? 'text-emerald-400' : 'text-muted-foreground'}>
                        {step.done ? '✓' : '○'}
                      </span>{' '}
                      {step.label}
                    </span>
                    {!step.done ? step.action : null}
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Or use <strong>Run approval demo</strong> above to seed the default agent, submit, and start a run in one
              click.
            </p>
          </Card>
        ) : (
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Recent runs</h2>
              <Link href="/operations/runs" className="text-sm text-primary underline">
                View all
              </Link>
            </div>
            {data.recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.recentRuns.map((run) => (
                  <li key={run.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/runs/${run.id}`} className="font-mono underline">
                        {run.id.slice(0, 8)}…
                      </Link>
                      <span className={`rounded-full border border-border px-2 py-0.5 text-xs ${runStatusClass(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {run.agentId} · {new Date(run.createdAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Hubs</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <HubLink href="/agents" title="Agents" detail={`${data.counts.agents} registered · ${data.setup.hasDefaultAgent ? 'default ready' : 'default missing'}`} />
            <HubLink
              href="/workflows"
              title="Workflows"
              detail={`${data.counts.workflows} graphs${axEngine?.reachable ? ` · ${axEngine.flowCount} ax flows` : ' · ax-server offline'}`}
            />
            <HubLink
              href="/operations"
              title="Operations"
              detail={
                data.counts.pendingApprovals > 0
                  ? `${data.counts.pendingApprovals} pending approvals${data.counts.activeRuns > 0 ? ` · ${data.counts.activeRuns} active` : ''}`
                  : `No pending approvals${data.counts.activeRuns > 0 ? ` · ${data.counts.activeRuns} active runs` : ''}`
              }
              badge={data.counts.pendingApprovals > 0 ? data.counts.pendingApprovals : undefined}
            />
            <HubLink href="/settings" title="Settings" detail="Theme lab and dashboard appearance" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function HubLink({
  href,
  title,
  detail,
  badge,
}: {
  href: string;
  title: string;
  detail: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="relative rounded-md border border-border px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{title}</span>
        {badge ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </Link>
  );
}
