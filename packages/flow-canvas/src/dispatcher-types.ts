/** SSE payloads from ax-server POST /dispatcher?stream=1 */
export type DispatcherStreamEvent =
  | { type: 'route-decision'; route: string; mechanism?: string; rationale?: string }
  | { type: 'status'; text: string }
  | { type: 'trace'; traceId: string }
  | {
      type: 'turn';
      stage?: string;
      turn?: number;
      code?: string;
      output?: string;
      modelOutput?: string;
      isError?: boolean;
      model?: string;
      latencySec?: number;
      thought?: string;
    }
  | { type: 'tool-call'; name?: string; qualifiedName?: string; args?: unknown }
  | { type: 'assert'; text: string }
  | { delta: string }
  | { error: string };

export function parseDispatcherSsePayload(raw: string): DispatcherStreamEvent | null {
  if (!raw || raw === '[DONE]') return null;
  try {
    return JSON.parse(raw) as DispatcherStreamEvent;
  } catch {
    return null;
  }
}

export function delegateNodeId(qualifiedName?: string): string | null {
  if (!qualifiedName) return null;
  if (qualifiedName.startsWith('team.')) return qualifiedName;
  if (qualifiedName === 'team.planner' || qualifiedName === 'team.coder' || qualifiedName === 'team.researcher') {
    return qualifiedName;
  }
  const match = /^team\.(planner|coder|researcher)$/.exec(qualifiedName);
  return match ? qualifiedName : null;
}
