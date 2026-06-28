/** Router tiers aligned with `conversation-flow-canvas` / ax-server routing. */
export type RouteTier = 'trivial' | 'personal_fact' | 'simple_direct' | 'complex_agentic';

/** Slice E — expected front-door path for replay ghost rendering. */
export type VisualPathExpectation = {
  routeTier?: RouteTier | null;
  mapNodes: string[];
  mapEdges: string[];
  delegates: string[];
  excludeDelegates: string[];
};

export type RoutingCaseShape = {
  path: 'dispatcher' | 'short-circuit' | 'either';
  expectFirst?: string | null;
  expectAny?: string[];
  forbid?: string[];
  allowDirect?: boolean;
};

function normDelegate(name: string): string {
  return name.trim().toLowerCase();
}

function matchesDelegate(actual: string, expected: string): boolean {
  const a = normDelegate(actual);
  const e = normDelegate(expected);
  return a === e || a.endsWith(`.${e.split('.').pop()}`);
}

function collectDelegates(c: RoutingCaseShape): string[] {
  const names: string[] = [];
  if (c.expectFirst) names.push(c.expectFirst);
  for (const e of c.expectAny ?? []) {
    if (!names.some((n) => matchesDelegate(n, e))) names.push(e);
  }
  return names;
}

/**
 * Derive canvas ghost path from ax-sandbox routing case fields (issue #12 Slice E).
 */
export function visualExpectationsFromRoutingCase(c: RoutingCaseShape): VisualPathExpectation {
  const delegates = collectDelegates(c);
  const excludeDelegates = c.forbid ?? [];
  const baseNodes = ['message', 'greeting'];
  const baseEdges = ['message->greeting'];

  const wantsShortCircuit = c.path === 'short-circuit' || (c.path === 'either' && !delegates.length);
  const directOk = c.allowDirect !== false && c.expectFirst === null && !c.expectAny?.length;

  if (wantsShortCircuit && directOk) {
    return {
      routeTier: 'trivial',
      mapNodes: [...baseNodes, 'fast'],
      mapEdges: [...baseEdges, 'greeting->fast'],
      delegates: [],
      excludeDelegates,
    };
  }

  if (wantsShortCircuit && !delegates.length) {
    return {
      routeTier: 'personal_fact',
      mapNodes: [...baseNodes, 'classify', 'fact'],
      mapEdges: [...baseEdges, 'greeting->classify', 'classify->fact'],
      delegates: [],
      excludeDelegates,
    };
  }

  if (delegates.length === 0 && c.allowDirect && c.path !== 'dispatcher') {
    return {
      routeTier: 'simple_direct',
      mapNodes: [...baseNodes, 'classify', 'direct'],
      mapEdges: [...baseEdges, 'greeting->classify', 'classify->direct'],
      delegates: [],
      excludeDelegates,
    };
  }

  return {
    routeTier: 'complex_agentic',
    mapNodes: [...baseNodes, 'classify', 'complex', 'loop', 'answer'],
    mapEdges: [
      ...baseEdges,
      'greeting->classify',
      'classify->complex',
      'complex->loop',
      'loop->answer',
    ],
    delegates,
    excludeDelegates,
  };
}

/** Map a live `Turn.route` tier string to `RouteTier`. */
export function normalizeRouteTier(route?: string | null): RouteTier | undefined {
  if (!route) return undefined;
  const r = route.trim();
  if (r === 'trivial' || r === 'personal_fact' || r === 'simple_direct' || r === 'complex_agentic') {
    return r;
  }
  if (/^(greet|trivial)/i.test(r)) return 'trivial';
  if (/fact/i.test(r)) return 'personal_fact';
  if (/(direct|simple)/i.test(r)) return 'simple_direct';
  return 'complex_agentic';
}
