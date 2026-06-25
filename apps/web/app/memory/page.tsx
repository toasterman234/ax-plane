'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_AGENT_ID } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type MemoryEntry = {
  id: string;
  agentId: string | null;
  runId: string | null;
  content: string;
  tags: string[];
  createdAt: string;
};

type AgentRow = { id: string; name: string };

export default function MemoryPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('ops, decision');
  const [scope, setScope] = useState<'global' | 'agent'>('global');
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [filterAgentId, setFilterAgentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<AgentRow[]>('/agents') });

  const memory = useQuery({
    queryKey: ['memory', filterAgentId, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterAgentId) params.set('agentId', filterAgentId);
      if (searchQuery.trim()) params.set('query', searchQuery.trim());
      const qs = params.toString();
      return api<MemoryEntry[]>(`/memory${qs ? `?${qs}` : ''}`);
    },
  });

  async function saveMemory() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const entry = await api<MemoryEntry>('/memory', {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          agentId: scope === 'global' ? null : agentId,
        }),
      });
      await memory.refetch();
      setContent('');
      setMessage(`Saved memory ${entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Memory</h1>
        <p className="text-muted-foreground">
          Persistent recall across runs. The memory kernel auto-injects relevant entries at run start; agents can also use memory.* tools.
        </p>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Seed a memory</h2>
        <textarea
          className="w-full rounded-md border border-border bg-card p-3 text-sm"
          rows={3}
          placeholder="Ben prefers approval-gated write tools."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-foreground">
            Tags (comma-separated)
            <input
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <label className="text-sm text-foreground">
            Scope
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'global' | 'agent')}
            >
              <option value="global">Global (all agents)</option>
              <option value="agent">Agent-specific</option>
            </select>
          </label>
          {scope === 'agent' ? (
            <label className="text-sm text-foreground">
              Agent
              <select
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <Button onClick={saveMemory} disabled={saving || !content.trim()}>
          {saving ? 'Saving…' : 'Save memory'}
        </Button>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Browse</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Filter by agent
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={filterAgentId}
              onChange={(e) => setFilterAgentId(e.target.value)}
            >
              <option value="">All visible</option>
              <option value="global">Global only</option>
              {(agents.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Search
            <input
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="approval tools"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        </div>

        {memory.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <ul className="space-y-3">
          {(memory.data ?? []).map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
              <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{entry.agentId ? `agent:${entry.agentId}` : 'global'}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
                {entry.tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-2 py-0.5">{tag}</span>
                ))}
              </div>
              <p className="text-foreground">{entry.content}</p>
            </li>
          ))}
        </ul>
        {!memory.isLoading && (memory.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No memories yet. Seed one above or let an agent call memory.save during a run.</p>
        ) : null}
      </Card>
    </div>
  );
}
