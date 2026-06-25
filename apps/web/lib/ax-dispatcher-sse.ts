import type { DispatcherStreamEvent } from '@axplane/flow-canvas';
import { parseDispatcherSsePayload } from '@axplane/flow-canvas';
import { API_URL } from '@/lib/api';

export async function streamAxEngineDispatcherRun(args: {
  query: string;
  onEvent: (event: DispatcherStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<{ output: string; ok: boolean; error?: string; latencySec: number }> {
  const started = Date.now();
  const res = await fetch(`${API_URL}/ax-engine/dispatcher-run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: args.query }),
    signal: args.signal,
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
      args.onEvent(event);
      if ('delta' in event && event.delta) output += event.delta;
      if ('error' in event && event.error) error = event.error;
    }
  }

  return { output: output.trim(), ok: !error, error, latencySec: (Date.now() - started) / 1000 };
}
