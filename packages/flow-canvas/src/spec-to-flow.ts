import type { Edge, Node } from '@xyflow/react';
import type { FlowSpec } from './types';

export type NodeRunInfo = {
  latencySec: number | null;
  ok: boolean;
  status?: 'running' | 'ok' | 'error';
  output?: string;
  totalTokens?: number;
};

export type TraceOverlay = Record<string, NodeRunInfo>;

export type FlowNodeVariant =
  | 'intake'
  | 'gen'
  | 'output'
  | 'gate'
  | 'branch'
  | 'tool'
  | 'fanout';

export type NodeInlineDetail = {
  model?: string;
  promptPreview?: string;
  output?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
};

export type FlowNodeData = {
  title: string;
  subtitle: string;
  variant: FlowNodeVariant;
  run?: NodeRunInfo;
  selected?: boolean;
  detail?: NodeInlineDetail;
  expanded?: boolean;
  onToggle?: (id: string) => void;
  id?: string;
};

export type SpecToFlowOpts = {
  details?: Record<string, NodeInlineDetail>;
  expanded?: Set<string>;
  onToggle?: (id: string) => void;
};

const COL_X = 0;
const ROW_GAP = 140;
const COL_GAP = 240;

function fmtFields(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

function variantForKind(kind: string | undefined): FlowNodeVariant {
  switch (kind) {
    case 'gate':
    case 'branch':
    case 'tool':
    case 'fanout':
      return kind;
    default:
      return 'gen';
  }
}

function decorateEdges(edges: Edge[], overlay?: TraceOverlay): Edge[] {
  if (!overlay) return edges;
  return edges.map((e) => {
    const status = overlay[e.target]?.status;
    if (status === 'running') {
      return { ...e, animated: true, style: { stroke: '#f59e0b', strokeWidth: 2 } };
    }
    if (status === 'ok') {
      return { ...e, style: { stroke: '#10b981', strokeWidth: 1.5 } };
    }
    if (status === 'error') {
      return { ...e, style: { stroke: '#ef4444', strokeWidth: 1.5 } };
    }
    return e;
  });
}

export function specToFlow(
  spec: FlowSpec,
  overlay?: TraceOverlay,
  selectedNodeId?: string | null,
  opts?: SpecToFlowOpts,
): {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
} {
  const intakeId = '__in';
  const outId = '__out';

  const executeOrder = spec.steps
    .filter((s): s is Extract<typeof s, { op: 'execute' }> => s.op === 'execute')
    .map((s) => s.node);

  const dagMode = spec.nodes.some((n) => n.dependsOn !== undefined);

  const mkNode = (
    id: string,
    x: number,
    y: number,
    data: Omit<FlowNodeData, 'selected'>,
  ): Node<FlowNodeData> => ({
    id,
    type: 'axNode',
    position: { x, y },
    data: {
      ...data,
      selected: selectedNodeId === id,
      id,
      detail: opts?.details?.[id],
      expanded: opts?.expanded?.has(id) ?? false,
      onToggle: opts?.onToggle,
    },
  });

  if (!dagMode) {
    const nodes: Node<FlowNodeData>[] = [];
    const edges: Edge[] = [];
    let row = 0;
    const yFor = (r: number) => r * ROW_GAP;

    nodes.push(mkNode(intakeId, COL_X, yFor(row++), { title: 'in', subtitle: fmtFields(spec.in), variant: 'intake' }));
    let prevId = intakeId;
    for (const nodeId of executeOrder) {
      const specNode = spec.nodes.find((n) => n.id === nodeId);
      nodes.push(
        mkNode(nodeId, COL_X, yFor(row++), {
          title: nodeId,
          subtitle: specNode?.signature ?? '',
          variant: variantForKind(specNode?.kind),
          run: overlay?.[nodeId],
        }),
      );
      edges.push({ id: `${prevId}->${nodeId}`, source: prevId, target: nodeId });
      prevId = nodeId;
    }
    nodes.push(mkNode(outId, COL_X, yFor(row++), { title: 'out', subtitle: fmtFields(spec.out), variant: 'output' }));
    edges.push({ id: `${prevId}->${outId}`, source: prevId, target: outId });
    return { nodes, edges: decorateEdges(edges, overlay) };
  }

  const parentsOf = (id: string): string[] => {
    const dep = spec.nodes.find((n) => n.id === id)?.dependsOn;
    return dep && dep.length ? dep : [intakeId];
  };

  const rank = new Map<string, number>([[intakeId, 0]]);
  const rankOf = (id: string): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    const r = 1 + Math.max(...parentsOf(id).map(rankOf));
    rank.set(id, r);
    return r;
  };
  executeOrder.forEach(rankOf);

  const maxNodeRank = Math.max(0, ...executeOrder.map((id) => rank.get(id) ?? 0));
  const outRank = maxNodeRank + 1;

  const byRank = new Map<number, string[]>();
  for (const id of executeOrder) {
    const r = rank.get(id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  }
  const xFor = (idx: number, count: number) => COL_X + (idx - (count - 1) / 2) * COL_GAP;
  const yFor = (r: number) => r * ROW_GAP;

  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];

  nodes.push(mkNode(intakeId, COL_X, yFor(0), { title: 'in', subtitle: fmtFields(spec.in), variant: 'intake' }));

  for (const id of executeOrder) {
    const r = rank.get(id) ?? 1;
    const peers = byRank.get(r)!;
    const specNode = spec.nodes.find((n) => n.id === id);
    nodes.push(
      mkNode(id, xFor(peers.indexOf(id), peers.length), yFor(r), {
        title: id,
        subtitle: specNode?.signature ?? '',
        variant: variantForKind(specNode?.kind),
        run: overlay?.[id],
      }),
    );
    for (const p of parentsOf(id)) edges.push({ id: `${p}->${id}`, source: p, target: id });
  }

  const referenced = new Set<string>();
  for (const id of executeOrder) for (const p of parentsOf(id)) if (p !== intakeId) referenced.add(p);
  const sinks = executeOrder.filter((id) => !referenced.has(id));
  nodes.push(mkNode(outId, COL_X, yFor(outRank), { title: 'out', subtitle: fmtFields(spec.out), variant: 'output' }));
  for (const s of sinks.length ? sinks : executeOrder.slice(-1)) {
    edges.push({ id: `${s}->${outId}`, source: s, target: outId });
  }

  return { nodes, edges: decorateEdges(edges, overlay) };
}
