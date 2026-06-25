'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Workflow = {
  id: string;
  name: string;
  description: string;
  steps: Array<{ id: string; agentId: string; inputTemplate: string }>;
};

type RequestRow = { id: string; body: string; agentId: string };

export default function WorkflowsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [starting, setStarting] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const workflows = useQuery({ queryKey: ['workflows'], queryFn: () => api<Workflow[]>('/workflows') });
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => api<RequestRow[]>('/requests') });

  const activeWorkflowId = selectedWorkflowId || workflows.data?.[0]?.id || '';

  async function seedDemo() {
    setMessage(null);
    setError(null);
    try {
      const workflow = await api<Workflow>('/workflows/seed-demo', { method: 'POST' });
      await workflows.refetch();
      setSelectedWorkflowId(workflow.id);
      setMessage(`Demo workflow ready (${workflow.steps.length} steps)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed workflow');
    }
  }

  async function startWorkflowRun() {
    if (!activeWorkflowId || !selectedRequestId) return;
    setStarting(true);
    setMessage(null);
    setError(null);
    try {
      const run = await api<{ id: string }>('/runs', {
        method: 'POST',
        body: JSON.stringify({ requestId: selectedRequestId, workflowId: activeWorkflowId }),
      });
      setLastRunId(run.id);
      setMessage(`Graph run queued: ${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start workflow run');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="text-slate-400">
          Control-plane graph runs spawn child agent runs with handoffs — no in-process ax child loops.
        </p>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Definitions</h2>
          <Button className="bg-slate-800 text-white hover:bg-slate-700" onClick={seedDemo}>Seed demo workflow</Button>
        </div>
        {(workflows.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No workflows yet. Seed the demo to get a two-step lookup → summarize graph.</p>
        ) : (
          <div className="space-y-2">
            {workflows.data?.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                onClick={() => setSelectedWorkflowId(workflow.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  workflow.id === activeWorkflowId ? 'border-sky-700 bg-sky-950/20' : 'border-slate-800'
                }`}
              >
                <div className="font-medium">{workflow.name}</div>
                <div className="text-slate-400">{workflow.description}</div>
                <ol className="mt-2 list-decimal pl-5 text-xs text-slate-500">
                  {workflow.steps.map((step) => (
                    <li key={step.id}>{step.id} → {step.agentId}</li>
                  ))}
                </ol>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Start graph run</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Request
            <select
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={selectedRequestId}
              onChange={(e) => setSelectedRequestId(e.target.value)}
            >
              <option value="">Select a request</option>
              {(requests.data ?? []).map((request) => (
                <option key={request.id} value={request.id}>
                  {request.body.slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button onClick={startWorkflowRun} disabled={starting || !activeWorkflowId || !selectedRequestId}>
              {starting ? 'Starting…' : 'Start workflow run'}
            </Button>
          </div>
        </div>
        {lastRunId ? (
          <p className="text-sm text-slate-400">
            Watch the parent run on{' '}
            <Link href={`/runs/${lastRunId}`} className="text-sky-400 hover:underline">run detail</Link>
            {' '}or browse all <Link href="/runs" className="text-sky-400 hover:underline">runs</Link>.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
