'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/api';

type WorkerHealth = {
  ok?: boolean;
  pid?: number;
  lastTickAt?: string;
  mode?: string;
  message?: string;
};

type Health = {
  ok?: boolean;
  service?: string;
  status?: string;
  worker?: WorkerHealth;
};

export function useApiHealth() {
  return useQuery({
    queryKey: ['api-health', API_URL],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`API health ${res.status}`);
      const data = (await res.json()) as Health;
      if (data.service !== 'axplane-api') {
        throw new Error(
          `Wrong service on ${API_URL} (got ${JSON.stringify(data)}). Port 8787 is often Kilroy — AxPlane uses 8797.`,
        );
      }
      return data;
    },
    retry: 1,
    refetchInterval: 10_000,
  });
}

export function ApiStatusBanner() {
  const health = useApiHealth();

  if (health.isLoading) {
    return <p className="text-sm text-slate-500">Checking API at {API_URL}…</p>;
  }

  if (health.isError) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
        <p className="font-medium">Cannot reach AxPlane API at {API_URL}</p>
        <p className="mt-1 text-red-300/90">
          {health.error instanceof Error ? health.error.message : 'Connection failed'}
        </p>
        <p className="mt-2 text-xs text-red-300/70">
          From the axplane folder run: <code className="text-red-100">pnpm dev</code> (or{' '}
          <code className="text-red-100">pnpm dev:api</code>). If port 8787 is taken by Kilroy, use 8797 — see{' '}
          <code>.env</code>.
        </p>
      </div>
    );
  }

  const worker = health.data?.worker;
  if (worker && !worker.ok) {
    return (
      <div className="rounded-lg border border-amber-900/60 bg-amber-950/40 p-3 text-sm text-amber-100">
        <p className="font-medium">AxPlane worker is not healthy</p>
        <p className="mt-1 text-amber-200/90">{worker.message ?? 'Worker heartbeat missing or stale.'}</p>
        <p className="mt-2 text-xs text-amber-200/70">
          Run the full stack with <code className="text-amber-50">pnpm dev</code>. If you see duplicate-worker errors, run{' '}
          <code className="text-amber-50">pkill -f &quot;axplane/apps/worker&quot;</code> and restart once.
        </p>
      </div>
    );
  }

  return null;
}
