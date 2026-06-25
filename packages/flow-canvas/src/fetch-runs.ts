import type { AxEngineConfig } from './fetch-entries';
import { resolveAxEngineConfig } from './fetch-entries';
import type { AxEngineRunDetail, AxEngineRunSummary, AxFlowStreamEvent } from './derive-engine-run-overlay';

export const AX_FLOW_ORCHESTRATOR_AGENT_ID = '__axflow__';
export const QUANT_FLOW_ID = 'quant-research-pipeline';
export const ROUTER_FLOW_ID = 'path-router';

export function resolveFlowServerBase(flowId: string, config?: AxEngineConfig): string {
  const urls = resolveAxEngineConfig(config);
  if (flowId === QUANT_FLOW_ID) return urls.quantFlowUrl;
  if (flowId === ROUTER_FLOW_ID) return urls.routerFlowUrl;
  return urls.axServerUrl;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Engine returned ${res.status}`);
  }
  return JSON.parse(text) as T;
}

export async function fetchEngineRuns(
  flowId: string,
  limit = 30,
  config?: AxEngineConfig,
): Promise<AxEngineRunSummary[]> {
  const base = resolveFlowServerBase(flowId, config);
  const res = await fetch(`${base}/runs?flow=${encodeURIComponent(flowId)}&limit=${limit}`, {
    cache: 'no-store',
  });
  const data = await readJson<{ runs?: AxEngineRunSummary[] }>(res);
  return data.runs ?? [];
}

export async function fetchEngineRun(
  runId: string,
  flowId?: string,
  config?: AxEngineConfig,
): Promise<AxEngineRunDetail | null> {
  const bases = flowId
    ? [resolveFlowServerBase(flowId, config)]
    : [resolveAxEngineConfig(config).axServerUrl, resolveAxEngineConfig(config).quantFlowUrl, resolveAxEngineConfig(config).routerFlowUrl];

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      if (res.status === 404) continue;
      return await readJson<AxEngineRunDetail>(res);
    } catch {
      continue;
    }
  }
  return null;
}

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

export async function streamAxFlowRun(args: {
  flowId: string;
  input: string;
  config?: AxEngineConfig;
  onEvent?: (event: AxFlowStreamEvent) => Promise<void> | void;
}): Promise<{ output: string; ok: boolean; error?: string; latencySec: number }> {
  const base = resolveFlowServerBase(args.flowId, args.config);
  const res = await fetch(`${base}/flow/${encodeURIComponent(args.flowId)}?stream=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: args.input }),
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
      await args.onEvent?.(event);
      if (event.type === 'total') latencySec = event.latencySec;
      if (event.type === 'done') output = pickFlowText(event.result);
      if (event.type === 'error') error = event.error;
    }
  }

  return { output, ok: !error, error, latencySec };
}

function pickFlowText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const strings = Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
    return strings.length ? strings.join('\n\n') : JSON.stringify(value);
  }
  return String(value ?? '');
}

export type AxFlowRunInput = {
  runKind: 'axflow';
  flowId: string;
  flowInput: string;
  axflowState?: {
    overlay: Record<string, unknown>;
  };
};

export function readAxFlowRunInput(inputJson: unknown): AxFlowRunInput | null {
  if (!inputJson || typeof inputJson !== 'object') return null;
  const record = inputJson as Record<string, unknown>;
  if (record.runKind !== 'axflow' || typeof record.flowId !== 'string') return null;
  return {
    runKind: 'axflow',
    flowId: record.flowId,
    flowInput: String(record.flowInput ?? ''),
    axflowState: record.axflowState as AxFlowRunInput['axflowState'],
  };
}

export function isAxFlowRun(inputJson: unknown): boolean {
  return readAxFlowRunInput(inputJson) !== null;
}
