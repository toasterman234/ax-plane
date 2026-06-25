'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Agent = { id: string; name: string; description: string; enabled: boolean };

export default function AgentsPage() {
  const query = useQuery({ queryKey: ['agents'], queryFn: () => api<Agent[]>('/agents') });

  async function seed() {
    await api('/agents/seed-demo', { method: 'POST' });
    await query.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-slate-400">Registered Ax agents and current versions.</p>
        </div>
        <Button onClick={seed}>Seed demo agent</Button>
      </div>
      {query.data?.map((agent) => (
        <Card key={agent.id}>
          <div className="text-lg font-semibold">{agent.name}</div>
          <div className="text-sm text-slate-500">{agent.id}</div>
          <p className="mt-2 text-slate-300">{agent.description}</p>
        </Card>
      ))}
    </div>
  );
}
