'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useApiHealth } from '@/lib/api-health';
import { DEFAULT_AGENT_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Agent = { id: string; name: string; enabled: boolean };
type RequestRow = { id: string; body: string; createdAt: string };
type Run = { id: string; agentId: string; status: string; createdAt: string };
type Approval = { id: string; runId: string; toolName: string; status: string; decidedAt: string | null };
type Workflow = { id: string; name: string };
type RouteDecision = {
  selectedAgentId: string;
  reason: string;
  strategy: string;
};

const APPROVAL_DEMO_BODY =
  'Create a short plan and use the fake risky tool so I can test approvals.';

function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
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

export function HomeDashboard() {
  const queryClient = useQueryClient();
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  const health = useApiHealth();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<Agent[]>('/agents') });
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => api<RequestRow[]>('/requests') });
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api<Run[]>('/runs'), refetchInterval: 5000 });
  const approvals = useQuery({
    queryKey: ['approvals', 'all'],
    queryFn: () => api<Approval[]>('/approvals'),
    refetchInterval: 5000,
  });
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: () => api<Workflow[]>('/workflows') });

  const seedAgent = useMutation({
    mutationFn: () => api('/agents/seed-default', { method: 'POST' }),
    onSuccess: () => {
      setSeedError(null);
      setSeedMessage(`Default agent ready: ${DEFAULT_AGENT_ID}`);
      void agents.refetch();
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
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
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
      void workflows.refetch();
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
    const defaultReady = (agents.data ?? []).some((agent) => agent.id === DEFAULT_AGENT_ID);
    if (!defaultReady) {
      try {
        await api('/agents/seed-default', { method: 'POST' });
        await agents.refetch();
        setSeedMessage(`Default agent ready: ${DEFAULT_AGENT_ID}`);
      } catch (err) {
        setQuickError(err instanceof Error ? err.message : 'Install default agent first');
        return;
      }
    }
    createRequest.mutate({ body: APPROVAL_DEMO_BODY, autoStart: true });
  }

  const pendingApprovals = useMemo(
    () => (approvals.data ?? []).filter((row) => row.status === 'pending'),
    [approvals.data],
  );
  const decidedApprovals = useMemo(
    () => (approvals.data ?? []).filter((row) => row.status !== 'pending'),
    [approvals.data],
  );
  const runsNeedingApproval = useMemo(
    () => (runs.data ?? []).filter((run) => run.status === 'needs_approval'),
    [runs.data],
  );
  const recentFailedRuns = useMemo(
    () => (runs.data ?? []).filter((run) => run.status === 'failed' || run.status === 'cancelled').slice(0, 3),
    [runs.data],
  );
  const recentRuns = useMemo(() => (runs.data ?? []).slice(0, 5), [runs.data]);
  const activeRuns = useMemo(
    () =>
      (runs.data ?? []).filter((run) =>
        ['queued', 'running', 'needs_approval'].includes(run.status),
      ).length,
    [runs.data],
  );

  const hasDefaultAgent = (agents.data ?? []).some((agent) => agent.id === DEFAULT_AGENT_ID);
  const hasRequest = (requests.data?.length ?? 0) > 0;
  const hasCompletedRun = (runs.data ?? []).some((run) => run.status === 'completed');
  const hasApprovalFlow = decidedApprovals.length > 0 || pendingApprovals.length > 0;

  const setupSteps = [
    {
      id: 'agent',
      label: 'Install default agent',
      done: hasDefaultAgent,
      action: hasDefaultAgent ? (
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
      done: hasRequest,
      action: (
        <Link href="/operations/requests" className="text-sm text-primary underline">
          Open requests
        </Link>
      ),
    },
    {
      id: 'run',
      label: 'Complete a run',
      done: hasCompletedRun,
      action: (
        <Link href="/operations/runs" className="text-sm text-primary underline">
          Open runs
        </Link>
      ),
    },
    {
      id: 'approval',
      label: 'Exercise approval flow',
      done: hasApprovalFlow,
      action: (
        <Link href="/operations/approvals" className="text-sm text-primary underline">
          Open approvals
        </Link>
      ),
    },
  ];

  const setupComplete = setupSteps.every((step) => step.done);
  const setupDoneCount = setupSteps.filter((step) => step.done).length;

  const attentionItems: Array<{ key: string; text: string; href: string; cta: string }> = [];
  if (pendingApprovals.length > 0) {
    attentionItems.push({
      key: 'approvals',
      text: `${pendingApprovals.length} pending approval${pendingApprovals.length === 1 ? '' : 's'}`,
      href: '/operations/approvals',
      cta: 'Review',
    });
  }
  for (const run of runsNeedingApproval.slice(0, 3)) {
    attentionItems.push({
      key: run.id,
      text: `Run ${run.id.slice(0, 8)}… waiting on approval (${run.agentId})`,
      href: `/runs/${run.id}`,
      cta: 'Open run',
    });
  }
  for (const run of recentFailedRuns) {
    attentionItems.push({
      key: `failed-${run.id}`,
      text: `Failed run ${run.id.slice(0, 8)}… (${run.agentId})`,
      href: `/runs/${run.id}`,
      cta: 'Inspect',
    });
  }

  const worker = health.data?.worker;
  const axEngine = health.data?.axEngine;
  const executionMode = health.data?.router?.executionMode ?? 'mock';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mission control</h1>
        <p className="mt-1 text-muted-foreground">
          Stack health, what needs you, and recent activity across Ax Plane.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">System status</h2>
        {health.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking API…</p>
        ) : health.isError ? (
          <p className="text-sm text-red-400">
            {health.error instanceof Error ? health.error.message : 'API unreachable'}
          </p>
        ) : (
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
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Needs attention</h2>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-emerald-400/90">All clear — no pending approvals or blocked runs.</p>
        ) : (
          <ul className="space-y-2">
            {attentionItems.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{item.text}</span>
                <Link href={item.href} className="text-primary underline">
                  {item.cta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit work from Home or run one-click demos without leaving mission control.
          </p>
        </div>
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-card p-3 text-sm"
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
          <Button
            onClick={() => submitRequest(requestBody)}
            disabled={createRequest.isPending || !requestBody.trim()}
          >
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
        {!setupComplete ? (
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">First-run setup</h2>
              <span className="text-sm text-muted-foreground">
                {setupDoneCount}/{setupSteps.length}
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
            {recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentRuns.map((run) => (
                  <li key={run.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/runs/${run.id}`} className="font-mono underline">
                        {run.id.slice(0, 8)}…
                      </Link>
                      <span className={runStatusClass(run.status)}>{run.status}</span>
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
            <Link
              href="/agents"
              className="rounded-md border border-border px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="font-medium">Agents</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {agents.data?.length ?? '—'} registered
                {hasDefaultAgent ? ' · default ready' : ' · default missing'}
              </div>
            </Link>
            <Link
              href="/workflows"
              className="rounded-md border border-border px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="font-medium">Workflows</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {workflows.data?.length ?? '—'} graphs
                {axEngine?.reachable ? ` · ${axEngine.flowCount} ax flows` : ' · ax-server offline'}
              </div>
            </Link>
            <Link
              href="/operations"
              className="rounded-md border border-border px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="font-medium">Operations</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {pendingApprovals.length > 0 ? (
                  <span className="text-amber-300">{pendingApprovals.length} pending approvals</span>
                ) : (
                  'No pending approvals'
                )}
                {activeRuns > 0 ? ` · ${activeRuns} active run${activeRuns === 1 ? '' : 's'}` : null}
              </div>
            </Link>
            <Link
              href="/settings"
              className="rounded-md border border-border px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="font-medium">Settings</div>
              <div className="mt-1 text-xs text-muted-foreground">Theme lab and dashboard appearance</div>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
