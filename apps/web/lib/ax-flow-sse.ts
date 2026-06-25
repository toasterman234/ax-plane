import type { AxFlowStreamEvent } from '@axplane/flow-canvas';
import { API_URL } from '@/lib/api';

function parseSseLine(line: string): AxFlowStreamEvent | null {
  if (!line.startsWith('data: ')) return null;
  const payload = line.slice(6).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as AxFlowStreamEvent;
  } catch {
    return null;
  }
}

export async function streamAxEngineFlowRun(args: {
  flowId: string;
  input: string;
  onEvent: (event: AxFlowStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<{ output: string; ok: boolean; error?: string; latencySec: number }> {
  const res = await fetch(`${API_URL}/ax-engine/flow-run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flowId: args.flowId, input: args.input }),
    signal: args.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Flow run failed (${res.status})`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let latencySec = 0;
  let error: string | undefined;

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = parseSseLine(line);
      if (!event) continue;
      args.onEvent(event);
      if (event.type === 'total') latencySec = event.latencySec;
      if (event.type === 'done') {
        output =
          typeof event.result === 'string'
            ? event.result
            : event.result && typeof event.result === 'object'
              ? Object.values(event.result as Record<string, unknown>)
                  .filter((v): v is string => typeof v === 'string')
                  .join('\n\n')
              : String(event.result ?? '');
      }
      if (event.type === 'error') error = event.error;
    }
  }

  return { output, ok: !error, error, latencySec };
}
