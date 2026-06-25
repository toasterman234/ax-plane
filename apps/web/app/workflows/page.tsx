'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorkflowBuilder, type WorkflowDraft } from './workflow-builder';
import { WorkflowCanvasPanel } from './workflow-canvas-panel';

type Workflow = WorkflowDraft;

type RequestRow = { id: string; body: string; agentId: string };

type AgentRow = { id: string; name: string; enabled: boolean };

export default function WorkflowsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [starting, setStarting] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderInitial, setBuilderInitial] = useState<WorkflowDraft | null>(null);

  const workflows = useQuery({ queryKey: ['workflows'], queryFn: () => api<Workflow[]>('/workflows') });
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => api<RequestRow[]>('/requests') });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<AgentRow[]>('/agents') });

  const activeWorkflowId = selectedWorkflowId || workflows.data?.[0]?.id || '';
  const activeWorkflow = workflows.data?.find((w) => w.id === activeWorkflowId) ?? null;

  function openNewBuilder() {
    setBuilderInitial(null);
    setShowBuilder(true);
    setError(null);
    setMessage(null);
  }

  function openEditBuilder(workflow: Workflow) {
    setBuilderInitial({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      steps: workflow.steps.map((step) => ({ ...step })),
    });
    setShowBuilder(true);
    setError(null);
    setMessage(null);
  }

  function handleWorkflowSaved(workflow: Workflow) {
    setShowBuilder(false);
    setBuilderInitial(null);
    setSelectedWorkflowId(workflow.id);
    setMessage(`Workflow saved: ${workflow.name} (${workflow.steps.length} steps)`);
    void workflows.refetch();
  }

  async function seedDemo() {
    setMessage(null);
    setError(null);
    try {
      const workflow = await api<Workflow>('/workflows/seed-default', { method: 'POST' });
      await workflows.refetch();
      setSelectedWorkflowId(workflow.id);
      setMessage(`Sample workflow ready (${workflow.steps.length} steps)`);
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
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Definitions</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-secondary text-secondary-foreground hover:opacity-90"
              onClick={() => (showBuilder ? setShowBuilder(false) : openNewBuilder())}
            >
              {showBuilder ? 'Close builder' : 'New workflow'}
            </Button>
            <Button className="bg-secondary text-secondary-foreground hover:opacity-90" onClick={seedDemo}>
              Install sample workflow
            </Button>
          </div>
        </div>
        {(workflows.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflows yet. Build one below, or install the sample lookup → summarize graph.
          </p>
        ) : (
          <div className="space-y-2">
            {workflows.data?.map((workflow) => (
              <div
                key={workflow.id}
                className={`rounded-md border px-3 py-2 text-sm ${
                  workflow.id === activeWorkflowId ? 'border-sky-700 bg-sky-950/20' : 'border-border'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-medium">{workflow.name}</div>
                    <div className="text-muted-foreground">{workflow.description || workflow.id}</div>
                  </button>
                  <Button
                    type="button"
                    className="shrink-0 bg-muted text-foreground hover:bg-accent"
                    onClick={() => openEditBuilder(workflow)}
                  >
                    Edit
                  </Button>
                </div>
                <ol className="mt-2 list-decimal pl-5 text-xs text-muted-foreground">
                  {workflow.steps.map((step) => (
                    <li key={step.id}>{step.id} → {step.agentId}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Card>

      <WorkflowCanvasPanel workflow={activeWorkflow} />

      {showBuilder ? (
        <WorkflowBuilder
          key={builderInitial?.id ?? 'new'}
          agents={agents.data ?? []}
          initial={builderInitial}
          onSaved={handleWorkflowSaved}
        />
      ) : null}

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Start graph run</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Workflow
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={activeWorkflowId}
              onChange={(e) => setSelectedWorkflowId(e.target.value)}
            >
              <option value="">Select a workflow</option>
              {(workflows.data ?? []).map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Request
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
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
        </div>
        <div>
          <Button onClick={startWorkflowRun} disabled={starting || !activeWorkflowId || !selectedRequestId}>
            {starting ? 'Starting…' : 'Start workflow run'}
          </Button>
        </div>
        {lastRunId ? (
          <p className="text-sm text-muted-foreground">
            Watch the parent run on{' '}
            <Link href={`/runs/${lastRunId}`} className="text-sky-400 hover:underline">run detail</Link>
            {' '}or browse all <Link href="/operations/runs" className="text-sky-400 hover:underline">runs</Link>.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
