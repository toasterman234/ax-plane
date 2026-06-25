import type { NodeInlineDetail, TraceOverlay } from './spec-to-flow';

export type AxEngineRunSummary = {
  id: string;
  flowId: string;
  input: string;
  outputPreview: string;
  ok: boolean;
  error?: string;
  latencySec: number;
  ts: string;
};

export type AxEngineNodeDetail = {
  nodeId: string;
  model?: string;
  systemPrompt?: string;
  input?: string;
  output: string;
  tokens?: unknown;
};

export type AxEngineRunDetail = {
  id: string;
  flowId: string;
  input: string;
  output: string;
  ok: boolean;
  error?: string;
  latencySec: number;
  ts: string;
  nodes: AxEngineNodeDetail[];
};

export type AxFlowStreamEvent =
  | { type: 'node-start'; nodeId: string }
  | { type: 'node-end'; nodeId: string; latencySec?: number; output?: string }
  | { type: 'node-detail'; nodeId: string; model?: string; systemPrompt?: string; input?: string; output?: string; tokens?: unknown }
  | { type: 'total'; latencySec: number }
  | { type: 'done'; result?: unknown }
  | { type: 'error'; error: string };

function normalizeTokens(tokens: unknown): { totalTokens?: number; promptTokens?: number; completionTokens?: number } | undefined {
  if (!tokens || typeof tokens !== 'object') return undefined;
  const row = tokens as Record<string, unknown>;
  const total = typeof row.total === 'number' ? row.total : typeof row.totalTokens === 'number' ? row.totalTokens : undefined;
  const prompt = typeof row.prompt === 'number' ? row.prompt : typeof row.promptTokens === 'number' ? row.promptTokens : undefined;
  const completion = typeof row.completion === 'number' ? row.completion : typeof row.completionTokens === 'number' ? row.completionTokens : undefined;
  if (total === undefined && prompt === undefined && completion === undefined) return undefined;
  return { totalTokens: total, promptTokens: prompt, completionTokens: completion };
}

export function deriveEngineRunOverlay(detail: Pick<AxEngineRunDetail, 'nodes' | 'ok' | 'error'>): {
  overlay: TraceOverlay;
  details: Record<string, NodeInlineDetail>;
} {
  const overlay: TraceOverlay = {};
  const details: Record<string, NodeInlineDetail> = {};

  for (const node of detail.nodes ?? []) {
    if (!node.nodeId) continue;
    const tokens = normalizeTokens(node.tokens);
    overlay[node.nodeId] = {
      latencySec: null,
      ok: detail.ok,
      status: detail.ok ? 'ok' : 'error',
      output: node.output,
      totalTokens: tokens?.totalTokens,
    };
    details[node.nodeId] = {
      model: node.model,
      promptPreview: node.systemPrompt || node.input,
      output: node.output,
      totalTokens: tokens?.totalTokens,
      promptTokens: tokens?.promptTokens,
      completionTokens: tokens?.completionTokens,
    };
  }

  return { overlay, details };
}

export function applyAxFlowStreamEvent(
  overlay: TraceOverlay,
  details: Record<string, NodeInlineDetail>,
  event: AxFlowStreamEvent,
): void {
  if (event.type === 'node-start') {
    overlay[event.nodeId] = { latencySec: null, ok: true, status: 'running' };
    return;
  }
  if (event.type === 'node-end') {
    overlay[event.nodeId] = {
      latencySec: event.latencySec ?? null,
      ok: true,
      status: 'ok',
      output: event.output,
      totalTokens: overlay[event.nodeId]?.totalTokens,
    };
    return;
  }
  if (event.type === 'node-detail') {
    const tokens = normalizeTokens(event.tokens);
    overlay[event.nodeId] = {
      latencySec: overlay[event.nodeId]?.latencySec ?? null,
      ok: true,
      status: overlay[event.nodeId]?.status === 'running' ? 'ok' : overlay[event.nodeId]?.status ?? 'ok',
      output: event.output ?? overlay[event.nodeId]?.output,
      totalTokens: tokens?.totalTokens,
    };
    details[event.nodeId] = {
      model: event.model,
      promptPreview: event.systemPrompt || event.input,
      output: event.output,
      totalTokens: tokens?.totalTokens,
      promptTokens: tokens?.promptTokens,
      completionTokens: tokens?.completionTokens,
    };
  }
}
