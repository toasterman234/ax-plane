'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Agent = { id: string; name: string; description: string; enabled: boolean };

export default function AgentsPage() {
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['agents'], queryFn: () => api<Agent[]>('/agents') });

  async function seed() {
    setSeeding(true);
    setMessage(null);
    setError(null);
    try {
      await api('/agents/seed-demo', { method: 'POST' });
      await query.refetch();
      setMessage('Demo agent ready: demo_ax_agent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed demo agent. Is the API running on :8797?');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-slate-400">Registered Ax agents and current versions.</p>
        </div>
        <Button onClick={seed} disabled={seeding}>{seeding ? 'Seeding…' : 'Seed demo agent'}</Button>
      </div>
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {query.isLoading ? <p className="text-sm text-slate-500">Loading agents…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-400">
          Could not load agents. Check that the API is running at {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8797'}.
        </p>
      ) : null}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 ? (
        <Card>
          <p className="text-slate-300">No agents yet. Click <strong>Seed demo agent</strong> to register the MVP demo agent.</p>
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
            <Link href={`/agents/${agent.id}`} className="text-sm text-slate-400 hover:text-white shrink-0">
              Edit config →
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
