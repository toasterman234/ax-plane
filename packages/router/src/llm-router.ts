import type { RouteCandidate, RouteDecision, RoutableAgent } from './index';
import { routingConfig } from './routing-utils';

export type AgentCatalogEntry = {
  id: string;
  name: string;
  description: string;
  keywords: string[];
};

export function buildAgentCatalog(agents: RoutableAgent[]): AgentCatalogEntry[] {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    keywords: routingConfig(agent.configJson).keywords,
  }));
}

function buildCandidates(
  agents: RoutableAgent[],
  scores: Array<{ agentId: string; score: number; reason: string; matchedKeywords?: string[] }>,
): RouteCandidate[] {
  return scores
    .sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId))
    .map((row) => ({
      agentId: row.agentId,
      score: row.score,
      matchedKeywords: row.matchedKeywords ?? [],
      reason: row.reason,
    }));
}

/** Deterministic classifier for mock mode and tests — no API key required. */
export function mockLlmRouteRequest(input: {
  body: string;
  agents: RoutableAgent[];
}): RouteDecision {
  const haystack = input.body.toLowerCase();
  const scored = input.agents.map((agent) => {
    const routing = routingConfig(agent.configJson);
    const matchedKeywords = routing.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
    let score = matchedKeywords.length * 25;
    const name = agent.name.toLowerCase();
    if (name && haystack.includes(name)) score += 40;

    for (const token of agent.description.toLowerCase().split(/\W+/)) {
      if (token.length > 3 && haystack.includes(token)) score += 8;
    }

    for (const token of agent.id.toLowerCase().split(/[_-]/)) {
      if (token.length > 3 && haystack.includes(token)) score += 6;
    }

    const reason = matchedKeywords.length > 0
      ? `Mock LLM matched keywords: ${matchedKeywords.join(', ')}`
      : score > 0
        ? `Mock LLM matched agent profile for ${agent.name}`
        : `Weak mock LLM match for ${agent.name}`;

    return { agentId: agent.id, score, matchedKeywords, reason };
  });

  const candidates = buildCandidates(input.agents, scored);
  let winner = candidates[0];
  if (!winner || winner.score === 0) {
    const fallback = input.agents.find((agent) => routingConfig(agent.configJson).isDefault) ?? input.agents[0];
    winner = {
      agentId: fallback!.id,
      score: 10,
      matchedKeywords: [],
      reason: `Mock LLM default tie-break: ${fallback!.name}`,
    };
    return {
      selectedAgentId: fallback!.id,
      reason: `${fallback!.name}: ${winner.reason}`,
      strategy: 'llm',
      confidence: 0.4,
      candidates: buildCandidates(input.agents, [
        winner,
        ...candidates.filter((row) => row.agentId !== winner!.agentId),
      ]),
    };
  }

  const selected = input.agents.find((agent) => agent.id === winner.agentId)!;
  const confidence = Math.min(0.95, Math.max(0.35, winner.score / 100));

  return {
    selectedAgentId: selected.id,
    reason: `${selected.name}: ${winner.reason}`,
    strategy: 'llm',
    confidence,
    candidates,
  };
}

function resolveRouterLlmConfig() {
  const apiKey = process.env.AX_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
  if (!apiKey) {
    throw new Error(
      'LLM routing in real mode requires AX_API_KEY or OPENAI_API_KEY.',
    );
  }
  return {
    provider: process.env.AX_PROVIDER ?? 'openai',
    apiKey,
    apiURL: process.env.AX_BASE_URL,
    model: process.env.AX_ROUTER_MODEL ?? process.env.AX_MODEL ?? 'gpt-4o-mini',
    temperature: Number(process.env.AX_ROUTER_TEMPERATURE ?? 0),
  };
}

function createRouterLlm(ax: typeof import('@ax-llm/ax')) {
  const config = resolveRouterLlmConfig();
  return ax.ai({
    name: config.provider,
    apiKey: config.apiKey,
    ...(config.apiURL ? { apiURL: config.apiURL } : {}),
    config: { model: config.model, temperature: config.temperature },
  } as never);
}

const CLASSIFIER_SIGNATURE =
  'requestBody:string "the user request", agentCatalog:string "JSON list of agents" -> agentId:string, reason:string, confidence:number';

export async function llmRouteRequest(input: {
  body: string;
  agents: RoutableAgent[];
  mode: 'mock' | 'real';
}): Promise<RouteDecision> {
  if (input.agents.length === 0) {
    throw new Error('No enabled agents available for LLM routing');
  }
  if (input.mode === 'mock') {
    return mockLlmRouteRequest(input);
  }

  const ax = await import('@ax-llm/ax');
  const catalog = buildAgentCatalog(input.agents);
  const llm = createRouterLlm(ax);
  const program = ax.ax(CLASSIFIER_SIGNATURE, {
    description: [
      'You route incoming operator requests to the best agent.',
      'Pick agentId only from the provided catalog JSON.',
      'Prefer keyword overlap, agent description fit, and task intent.',
      'confidence must be between 0 and 1.',
    ].join(' '),
  });

  const raw = await program.forward(llm, {
    requestBody: input.body,
    agentCatalog: JSON.stringify(catalog),
  });

  const agentId = String((raw as { agentId?: string }).agentId ?? '').trim();
  const reason = String((raw as { reason?: string }).reason ?? 'LLM router selection').trim();
  const confidenceRaw = Number((raw as { confidence?: number }).confidence ?? 0.7);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.7;

  const selected = input.agents.find((agent) => agent.id === agentId);
  if (!selected) {
    throw new Error(`LLM router returned unknown agentId: ${agentId || '(empty)'}`);
  }

  const candidates = buildCandidates(
    input.agents,
    catalog.map((entry) => ({
      agentId: entry.id,
      score: entry.id === selected.id ? Math.round(confidence * 100) : 0,
      reason: entry.id === selected.id ? reason : 'Not selected',
      matchedKeywords: entry.keywords.filter((keyword) =>
        input.body.toLowerCase().includes(keyword.toLowerCase())),
    })),
  );

  return {
    selectedAgentId: selected.id,
    reason: `${selected.name}: ${reason}`,
    strategy: 'llm',
    confidence,
    candidates,
  };
}
