import { z } from 'zod';
import { llmRouteRequest } from './llm-router';
import { resolveRouterMode, type RouterMode } from './resolve-router-mode';
import { routingConfig } from './routing-utils';

export const RouteStrategySchema = z.enum([
  'explicit',
  'keyword',
  'default',
  'llm',
  'manual_override',
]);

export type RouteStrategy = z.infer<typeof RouteStrategySchema>;

export const RouteCandidateSchema = z.object({
  agentId: z.string(),
  score: z.number(),
  matchedKeywords: z.array(z.string()).default([]),
  reason: z.string(),
});

export type RouteCandidate = z.infer<typeof RouteCandidateSchema>;

export const RouteDecisionSchema = z.object({
  selectedAgentId: z.string(),
  reason: z.string(),
  strategy: RouteStrategySchema,
  confidence: z.number().min(0).max(1).optional(),
  candidates: z.array(RouteCandidateSchema).default([]),
  previousAgentId: z.string().optional(),
});

export type RouteDecision = z.infer<typeof RouteDecisionSchema>;

export type RoutableAgent = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configJson: unknown;
};

const FALLBACK_DEFAULT_AGENT_ID = 'demo_ax_agent';

function scoreAgent(body: string, agent: RoutableAgent): RouteCandidate {
  const routing = routingConfig(agent.configJson);
  const haystack = body.toLowerCase();
  const matchedKeywords = routing.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
  const score = matchedKeywords.length > 0
    ? matchedKeywords.length * 100 + (routing.priority ?? 0)
    : 0;
  const reason = matchedKeywords.length > 0
    ? `Matched keywords: ${matchedKeywords.join(', ')}`
    : routing.isDefault
      ? 'Marked as default agent'
      : 'No keyword match';
  return { agentId: agent.id, score, matchedKeywords, reason };
}

function pickDefaultAgent(agents: RoutableAgent[]): RoutableAgent | undefined {
  const flagged = agents.find((agent) => routingConfig(agent.configJson).isDefault);
  if (flagged) return flagged;
  const demo = agents.find((agent) => agent.id === FALLBACK_DEFAULT_AGENT_ID);
  if (demo) return demo;
  return agents[0];
}

export function routeRequest(input: {
  body: string;
  agents: RoutableAgent[];
  explicitAgentId?: string;
}): RouteDecision {
  const enabled = input.agents.filter((agent) => agent.enabled);
  if (enabled.length === 0) {
    throw new Error('No enabled agents available for routing');
  }

  if (input.explicitAgentId) {
    const chosen = enabled.find((agent) => agent.id === input.explicitAgentId);
    if (!chosen) {
      throw new Error(`Agent not found or disabled: ${input.explicitAgentId}`);
    }
    return {
      selectedAgentId: chosen.id,
      reason: `Explicit agent selection: ${chosen.name}`,
      strategy: 'explicit',
      confidence: 1,
      candidates: [{ agentId: chosen.id, score: 100, matchedKeywords: [], reason: 'Explicit selection' }],
    };
  }

  const candidates = enabled
    .map((agent) => scoreAgent(input.body, agent))
    .sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId));

  const best = candidates[0];
  if (best && best.matchedKeywords.length > 0) {
    const winner = enabled.find((agent) => agent.id === best.agentId)!;
    const maxScore = best.score;
    const confidence = Math.min(1, maxScore / Math.max(maxScore + 10, 20));
    return {
      selectedAgentId: winner.id,
      reason: `${winner.name}: ${best.reason}`,
      strategy: 'keyword',
      confidence,
      candidates,
    };
  }

  const fallback = pickDefaultAgent(enabled);
  if (!fallback) throw new Error('No routable agents available');

  return {
    selectedAgentId: fallback.id,
    reason: `Default route: ${fallback.name} (${routingConfig(fallback.configJson).isDefault ? 'configured default' : 'fallback agent'})`,
    strategy: 'default',
    confidence: 0.5,
    candidates,
  };
}

export async function routeRequestAsync(input: {
  body: string;
  agents: RoutableAgent[];
  explicitAgentId?: string;
  mode?: 'mock' | 'real';
  routerMode?: RouterMode;
}): Promise<RouteDecision> {
  const routerMode = input.routerMode ?? resolveRouterMode();
  const enabled = input.agents.filter((agent) => agent.enabled);

  if (input.explicitAgentId) {
    return routeRequest({ ...input, agents: enabled });
  }

  if (routerMode === 'keyword') {
    return routeRequest({ ...input, agents: enabled });
  }

  const mode = input.mode ?? (process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock');

  if (routerMode === 'llm') {
    return llmRouteRequest({ body: input.body, agents: enabled, mode });
  }

  const keywordDecision = routeRequest({ ...input, agents: enabled });
  if (keywordDecision.strategy !== 'default') {
    return keywordDecision;
  }

  try {
    return await llmRouteRequest({ body: input.body, agents: enabled, mode });
  } catch (error) {
    if (mode === 'real') throw error;
    return keywordDecision;
  }
}

export function manualOverrideDecision(input: {
  previousAgentId: string;
  selectedAgentId: string;
  reason?: string;
}): RouteDecision {
  return {
    selectedAgentId: input.selectedAgentId,
    previousAgentId: input.previousAgentId,
    reason: input.reason ?? `Manual override: ${input.previousAgentId} → ${input.selectedAgentId}`,
    strategy: 'manual_override',
    confidence: 1,
    candidates: [],
  };
}

export { resolveRouterMode } from './resolve-router-mode';
export type { RouterMode } from './resolve-router-mode';
export { mockLlmRouteRequest, llmRouteRequest, buildAgentCatalog } from './llm-router';
export { routingConfig } from './routing-utils';
