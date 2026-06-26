/**
 * Structure-only flow spec (ported from ax-studio lib/specs/types.ts).
 * The canvas REPRESENTS this spec; it never authors Ax flow logic.
 */

export type FlowNodeKind =
  | 'gen'
  | 'agent'
  | 'flow'
  | 'gate'
  | 'branch'
  | 'tool'
  | 'fanout';

export type FlowSpecNode = {
  id: string;
  kind: FlowNodeKind;
  signature: string;
  description?: string;
  dependsOn?: string[];
};

export type FlowSpecStep =
  | { op: 'execute'; node: string; inputFrom: string }
  | { op: 'returns'; from: string };

export type FlowSpec = {
  id: string;
  in: Record<string, string>;
  out: Record<string, string>;
  nodes: FlowSpecNode[];
  steps: FlowSpecStep[];
};

export type FlowEntry = {
  id: string;
  title: string;
  summary: string;
  spec: FlowSpec;
  /** Canonical dynamic-workflow pattern id (e.g. fanout-and-synthesize). */
  pattern?: string;
  patternSource?: 'corpus' | 'custom' | 'builder';
  corpusRef?: string;
};
