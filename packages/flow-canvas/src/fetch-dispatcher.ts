import { resolveAxEngineConfig, type AxEngineConfig } from './fetch-entries';
import type { DispatcherStreamEvent } from './dispatcher-types';
import { parseDispatcherSsePayload } from './dispatcher-types';

export const AX_DISPATCHER_ORCHESTRATOR_AGENT_ID = '__axdispatcher__';

export async function checkDispatcherReachable(config?: AxEngineConfig): Promise<boolean> {
  const { axServerUrl } = resolveAxEngineConfig(config);
  try {
    const res = await fetch(`${axServerUrl}/health`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { routes?: string[] };
    return Array.isArray(data.routes) && data.routes.includes('/dispatcher');
  } catch {
    return false;
  }
}

export async function streamAxDispatcherRun(args: {
  query: string;
  config?: AxEngineConfig;
  onEvent?: (event: DispatcherStreamEvent) => Promise<void> | void;
}): Promise<{ output: string; ok: boolean; error?: string; latencySec: number }> {
  const { axServerUrl } = resolveAxEngineConfig(args.config);
  const started = Date.now();
  const res = await fetch(`${axServerUrl}/dispatcher?stream=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: args.query }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Dispatcher run failed (${res.status})`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let error: string | undefined;

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const event = parseDispatcherSsePayload(line.slice(6).trim());
      if (!event) continue;
      await args.onEvent?.(event);
      if ('delta' in event && event.delta) output += event.delta;
      if ('error' in event && event.error) error = event.error;
    }
  }

  const latencySec = (Date.now() - started) / 1000;
  return { output: output.trim(), ok: !error, error, latencySec };
}
