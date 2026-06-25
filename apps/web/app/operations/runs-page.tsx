'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

type Run = { id: string; requestId: string; agentId: string; status: string; createdAt: string };

export default function RunsPage() {
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api<Run[]>('/runs'), refetchInterval: 2000 });

  return (
    <div className="space-y-4">
      {runs.data?.map((run) => (
        <Card key={run.id}>
          <div className="flex items-center justify-between">
            <div>
              <Link href={`/runs/${run.id}`} className="font-mono text-sm underline">{run.id}</Link>
              <div className="mt-1 text-sm text-muted-foreground">{run.agentId} · {new Date(run.createdAt).toLocaleString()}</div>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-sm">{run.status}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
