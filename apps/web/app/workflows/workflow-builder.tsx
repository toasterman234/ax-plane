'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const GRAPH_ORCHESTRATOR_ID = '__graph__';

export type WorkflowStepDraft = {
  id: string;
  agentId: string;
  inputTemplate: string;
};

export type WorkflowDraft = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStepDraft[];
};

type AgentRow = { id: string; name: string; enabled: boolean };

type Workflow = WorkflowDraft;

function slugifyId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([^a-z])/, 'a$1');
}

function emptyDraft(defaultAgentId = ''): WorkflowDraft {
  return {
    id: 'my_workflow',
    name: '',
    description: '',
    steps: [{ id: 'step1', agentId: defaultAgentId, inputTemplate: '{{taskText}}' }],
  };
}

function validateDraft(draft: WorkflowDraft, agents: AgentRow[]): string | null {
  const workflowId = slugifyId(draft.id);
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(workflowId)) {
    return 'Workflow id must be a lowercase slug (letter first, 3+ chars, a-z 0-9 _)';
  }
  if (!draft.name.trim()) return 'Name is required';

  if (draft.steps.length === 0) return 'Add at least one step';

  const stepIds = new Set<string>();
  const agentIds = new Set(agents.map((agent) => agent.id));

  for (const [index, step] of draft.steps.entries()) {
    const stepId = slugifyId(step.id);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(stepId)) {
      return `Step ${index + 1}: id must be a lowercase slug (e.g. lookup)`;
    }
    if (stepIds.has(stepId)) return `Duplicate step id: ${stepId}`;
    stepIds.add(stepId);

    if (!step.agentId) return `Step ${index + 1}: pick an agent`;
    if (step.agentId === GRAPH_ORCHESTRATOR_ID) {
      return `Step ${index + 1}: cannot use the graph orchestrator as step agent`;
    }
    if (!agentIds.has(step.agentId)) {
      return `Step ${index + 1}: agent "${step.agentId}" not found — create it under Agents first`;
    }
    if (!step.inputTemplate.trim()) return `Step ${index + 1}: input template is required`;
  }

  return null;
}

export function WorkflowBuilder({
  agents,
  onSaved,
  initial,
}: {
  agents: AgentRow[];
  onSaved: (workflow: Workflow) => void;
  initial?: WorkflowDraft | null;
}) {
  const runnableAgents = useMemo(
    () => agents.filter((agent) => agent.id !== GRAPH_ORCHESTRATOR_ID && agent.enabled !== false),
    [agents],
  );
  const defaultAgentId = runnableAgents[0]?.id ?? '';

  const [draft, setDraft] = useState<WorkflowDraft>(() => initial ?? emptyDraft(defaultAgentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!defaultAgentId) return;
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.agentId ? step : { ...step, agentId: defaultAgentId })),
    }));
  }, [defaultAgentId]);

  function updateStep(index: number, patch: Partial<WorkflowStepDraft>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  }

  function addStep() {
    const nextIndex = draft.steps.length + 1;
    const priorStepId = draft.steps[draft.steps.length - 1]?.id ?? 'step1';
    setDraft((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: `step${nextIndex}`,
          agentId: defaultAgentId,
          inputTemplate: `Continue from prior step.\n\nPrior output:\n{{steps.${priorStepId}.output.answer}}`,
        },
      ],
    }));
  }

  function removeStep(index: number) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((_, i) => i !== index),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    setDraft((current) => {
      const steps = [...current.steps];
      const [row] = steps.splice(index, 1);
      steps.splice(target, 0, row);
      return { ...current, steps };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const validationError = validateDraft(draft, runnableAgents);
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    const payload: WorkflowDraft = {
      id: slugifyId(draft.id),
      name: draft.name.trim(),
      description: draft.description.trim(),
      steps: draft.steps.map((step) => ({
        id: slugifyId(step.id),
        agentId: step.agentId,
        inputTemplate: step.inputTemplate,
      })),
    };

    try {
      const workflow = await api<Workflow>('/workflows', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onSaved(workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Build workflow</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each step runs a separate agent run. Use{' '}
          <code className="text-xs">{'{{taskText}}'}</code> and{' '}
          <code className="text-xs">{'{{steps.<stepId>.output.answer}}'}</code> in templates.
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {runnableAgents.length === 0 ? (
        <p className="text-sm text-amber-400">
          No agents available. Create agents under <strong>Agents</strong> before saving a workflow.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Workflow id</span>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm"
            value={draft.id}
            onChange={(e) => setDraft((current) => ({ ...current, id: e.target.value }))}
            placeholder="lookup_summarize"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Name</span>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            value={draft.name}
            onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
            placeholder="Lookup then summarize"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Description</span>
        <textarea
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">Steps (run in order)</h3>
          <Button
            type="button"
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={addStep}
            disabled={!defaultAgentId}
          >
            Add step
          </Button>
        </div>

        {draft.steps.map((step, index) => (
          <div key={`${index}-${step.id}`} className="space-y-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Step {index + 1}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="bg-muted text-foreground hover:bg-accent"
                  disabled={index === 0}
                  onClick={() => moveStep(index, -1)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  className="bg-muted text-foreground hover:bg-accent"
                  disabled={index === draft.steps.length - 1}
                  onClick={() => moveStep(index, 1)}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  className="bg-muted text-red-300 hover:bg-accent"
                  disabled={draft.steps.length <= 1}
                  onClick={() => removeStep(index)}
                >
                  Remove
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Step id</span>
                <input
                  className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm"
                  value={step.id}
                  onChange={(e) => updateStep(index, { id: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Agent</span>
                <select
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  value={step.agentId}
                  onChange={(e) => updateStep(index, { agentId: e.target.value })}
                >
                  <option value="">Select agent</option>
                  {runnableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Input template</span>
              <textarea
                className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs"
                rows={index === 0 ? 2 : 4}
                value={step.inputTemplate}
                onChange={(e) => updateStep(index, { inputTemplate: e.target.value })}
              />
            </label>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving || runnableAgents.length === 0}>
        {saving ? 'Saving…' : 'Save workflow'}
      </Button>
    </Card>
  );
}

export { emptyDraft, slugifyId };
