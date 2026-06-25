'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { DEFAULT_AGENT_ID } from '@/lib/constants';

type Agent = { id: string; name: string; description: string; enabled: boolean };

type CreateTemplate = 'starter' | 'full';

function slugifyId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([^a-z])/, 'a$1');
}

export default function AgentsPage() {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newId, setNewId] = useState('research_agent');
  const [newName, setNewName] = useState('Research Agent');
  const [newDescription, setNewDescription] = useState('');
  const [newTemplate, setNewTemplate] = useState<CreateTemplate>('starter');
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['agents'], queryFn: () => api<Agent[]>('/agents') });

  async function seed() {
    setSeeding(true);
    setMessage(null);
    setError(null);
    try {
      await api('/agents/seed-default', { method: 'POST' });
      await query.refetch();
      setMessage(`Default agent ready: ${DEFAULT_AGENT_ID}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install default agent. Is the API running on :8797?');
    } finally {
      setSeeding(false);
    }
  }

  async function createAgent() {
    setCreating(true);
    setMessage(null);
    setError(null);
    try {
      const id = slugifyId(newId);
      if (!/^[a-z][a-z0-9_]{2,63}$/.test(id)) {
        throw new Error('Agent id must be a lowercase slug (letter first, 3+ chars, a-z 0-9 _)');
      }
      const result = await api<{ agent: Agent }>('/agents', {
        method: 'POST',
        body: JSON.stringify({
          id,
          name: newName.trim(),
          description: newDescription.trim(),
          template: newTemplate,
        }),
      });
      await query.refetch();
      setShowCreate(false);
      router.push(`/agents/${result.agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  }

  async function duplicateAgent(source: Agent) {
    const suggestedId = slugifyId(`${source.id}_copy`);
    const newAgentId = window.prompt('New agent id (lowercase slug)', suggestedId)?.trim();
    if (!newAgentId) return;

    const newAgentName = window.prompt('Display name', `${source.name} (copy)`)?.trim();
    if (!newAgentName) return;

    setDuplicatingId(source.id);
    setMessage(null);
    setError(null);
    try {
      const id = slugifyId(newAgentId);
      const result = await api<{ agent: Agent }>(`/agents/${source.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ id, name: newAgentName }),
      });
      await query.refetch();
      setMessage(`Duplicated ${source.id} → ${result.agent.id}`);
      router.push(`/agents/${result.agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate agent');
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-slate-400">Create, duplicate, and configure Ax agents.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-slate-800 text-white hover:bg-slate-700"
            onClick={() => { setShowCreate((v) => !v); setError(null); setMessage(null); }}
          >
            {showCreate ? 'Cancel' : 'New agent'}
          </Button>
          <Button onClick={seed} disabled={seeding}>{seeding ? 'Installing…' : 'Install default agent'}</Button>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {showCreate ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Create agent</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">Agent id</span>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="research_agent"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-500">Name</span>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Description</span>
            <textarea
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Template</span>
            <select
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value as CreateTemplate)}
            >
              <option value="starter">Starter — read-only tools</option>
              <option value="full">Full catalog — all host tools (not default router)</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">
            New agents are not the default router target. Add routing keywords in the editor after create.
          </p>
          <Button onClick={createAgent} disabled={creating || !newName.trim()}>
            {creating ? 'Creating…' : 'Create agent'}
          </Button>
        </Card>
      ) : null}

      {query.isLoading ? <p className="text-sm text-slate-500">Loading agents…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-400">
          Could not load agents. Check that the API is running at {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8797'}.
        </p>
      ) : null}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 ? (
        <Card>
          <p className="text-slate-300">
            No agents yet. Click <strong>New agent</strong> or <strong>Install default agent</strong> to get started.
          </p>
        </Card>
      ) : null}
      {query.data?.map((agent) => (
        <Card key={agent.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={`/agents/${agent.id}`} className="text-lg font-semibold hover:text-white">
                {agent.name}
              </Link>
              <div className="text-sm text-slate-500">{agent.id}</div>
              <p className="mt-2 text-slate-300">{agent.description}</p>
              {!agent.enabled ? <p className="mt-2 text-xs text-amber-400">Disabled</p> : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link href={`/agents/${agent.id}`} className="text-sm text-slate-400 hover:text-white text-right">
                Edit config →
              </Link>
              <Button
                className="bg-slate-800 text-white hover:bg-slate-700"
                disabled={duplicatingId === agent.id}
                onClick={() => duplicateAgent(agent)}
              >
                {duplicatingId === agent.id ? 'Duplicating…' : 'Duplicate'}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
