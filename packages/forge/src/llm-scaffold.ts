import { z } from 'zod';
import { AgentConfigSchema, type AgentConfig } from '@axplane/agents';
import { HOST_TOOL_CATALOG } from '@axplane/host-tools';
import type { EvalCriterion } from '@axplane/eval';
import type { ForgeIntake } from './intake-schema';
import type { ForgeEvalCaseDraft } from './eval-seed';
import { seedEvalCases } from './eval-seed';
import { scaffoldAgentConfig } from './scaffold';

export type ForgeScaffoldStrategy = 'heuristic' | 'llm';
export type ForgeScaffoldMode = 'mock' | 'real';

export type ForgeDraftMeta = {
  strategy: ForgeScaffoldStrategy;
  mode?: ForgeScaffoldMode;
  usedFallback: boolean;
  fallbackReason?: string;
  prompt?: string;
  rawOutput?: unknown;
  model?: string;
  at: string;
};

const HOST_TOOL_NAMES = new Set(HOST_TOOL_CATALOG.map((tool) => tool.qualifiedName));

const EvalCriterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run_completed') }),
  z.object({
    type: z.literal('run_status'),
    status: z.enum(['queued', 'running', 'needs_approval', 'completed', 'failed', 'cancelled']),
  }),
  z.object({
    type: z.literal('output_contains'),
    field: z.string().optional(),
    text: z.string().min(1),
    caseInsensitive: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('tool_called'),
    qualifiedName: z.string().min(1),
  }),
  z.object({
    type: z.literal('event_type'),
    eventType: z.string().min(1),
  }),
]);

const LlmEvalCaseSchema = z.object({
  name: z.string().min(1),
  taskText: z.string().min(1),
  criteria: z.array(EvalCriterionSchema).min(1),
});

export const LlmScaffoldOutputSchema = z.object({
  signature: z.string().min(1),
  tools: z.array(z.string()).min(1),
  routingKeywords: z.array(z.string()).optional().default([]),
  evalCases: z.array(LlmEvalCaseSchema).min(3).max(8),
  agentDescription: z.string().optional(),
});

export type LlmScaffoldOutput = z.infer<typeof LlmScaffoldOutputSchema>;

const FORGE_SCAFFOLD_SIGNATURE =
  'intakeSummary:string "operator intake summary", hostToolCatalog:string "JSON array of allowed host tools", heuristicDraft:string "JSON heuristic draft for reference" -> scaffoldJson:string "JSON object with signature, tools, routingKeywords, evalCases"';

function hostToolCatalogJson(): string {
  return JSON.stringify(
    HOST_TOOL_CATALOG.map((tool) => ({
      qualifiedName: tool.qualifiedName,
      description: tool.description,
      risk: tool.risk,
    })),
  );
}

function buildIntakeSummary(intake: ForgeIntake): string {
  return [
    `Task: ${intake.task}`,
    `Success: ${intake.success}`,
    `Failure / must-not: ${intake.failure}`,
    `Tool intents: ${intake.tools.join(', ')}`,
    `Judgment: ${intake.judgment}`,
    `Volume: ${intake.volume}`,
    intake.successExample ? `Success example: ${intake.successExample}` : null,
    intake.optimizeRequested ? 'Optimize requested later (prefer mode rlm).' : null,
    intake.memoryInject === false ? 'Memory kernel inject disabled.' : 'Memory kernel inject enabled.',
  ]
    .filter(Boolean)
    .join('\n');
}

function filterAllowedTools(tools: string[]): string[] {
  const allowed = tools.filter((tool) => HOST_TOOL_NAMES.has(tool));
  return allowed.length > 0 ? [...new Set(allowed)] : ['repo.readFile', 'docs.search'];
}

function normalizeEvalCases(cases: LlmScaffoldOutput['evalCases']): ForgeEvalCaseDraft[] {
  return cases.map((row, index) => ({
    name: row.name,
    taskText: row.taskText,
    criteria: row.criteria as EvalCriterion[],
    sortOrder: index,
  }));
}

export function applyLlmScaffoldOutput(input: {
  intake: ForgeIntake;
  agentId: string;
  name: string;
  llm: LlmScaffoldOutput;
  heuristicConfig: AgentConfig;
}): { agentConfig: AgentConfig; evalCases: ForgeEvalCaseDraft[] } {
  const tools = filterAllowedTools(input.llm.tools);
  const agentConfig = AgentConfigSchema.parse({
    ...input.heuristicConfig,
    id: input.agentId,
    name: input.name,
    description: input.llm.agentDescription?.trim() || input.intake.task,
    signature: input.llm.signature.trim(),
    tools,
    routing: {
      ...(input.heuristicConfig.routing ?? { keywords: [], priority: 0, isDefault: false }),
      keywords: (input.llm.routingKeywords ?? []).map((k) => k.toLowerCase()).slice(0, 8),
    },
  });
  const evalCases = normalizeEvalCases(input.llm.evalCases);
  return { agentConfig, evalCases };
}

export function parseLlmScaffoldJson(raw: string): LlmScaffoldOutput {
  const parsed = JSON.parse(raw) as unknown;
  return LlmScaffoldOutputSchema.parse(parsed);
}

/** Deterministic LLM-style scaffold for mock mode and tests. */
export function mockLlmScaffoldDraft(input: {
  intake: ForgeIntake;
  agentId: string;
  name: string;
}): { agentConfig: AgentConfig; evalCases: ForgeEvalCaseDraft[] } {
  const heuristicConfig = scaffoldAgentConfig({
    intake: input.intake,
    agentId: input.agentId,
    name: input.name,
  });
  const heuristicCases = seedEvalCases(input.intake);

  const signature = input.intake.judgment === 'exact'
    ? 'taskText:string "the user task" -> answer:string'
    : 'taskText:string "the user task" -> answer:string, rationale:string, nextActions:string[]';

  const tools = filterAllowedTools(heuristicConfig.tools);
  const evalCases = [
    ...heuristicCases.slice(0, 3),
    {
      name: 'Mock LLM quality bar',
      taskText: `${input.intake.task}\n\nSuccess bar: ${input.intake.success}`,
      criteria: [
        { type: 'run_completed' as const },
        {
          type: 'output_contains' as const,
          field: 'answer',
          text: input.intake.success.slice(0, 32),
          caseInsensitive: true,
        },
      ],
      sortOrder: 3,
    },
  ].map((row, index) => ({ ...row, sortOrder: index }));

  const llmOutput = LlmScaffoldOutputSchema.parse({
    signature,
    tools,
    routingKeywords: heuristicConfig.routing?.keywords ?? [],
    evalCases: evalCases.map(({ name, taskText, criteria }) => ({ name, taskText, criteria })),
    agentDescription: input.intake.task,
  });

  return applyLlmScaffoldOutput({
    intake: input.intake,
    agentId: input.agentId,
    name: input.name,
    llm: llmOutput,
    heuristicConfig,
  });
}

function resolveForgeLlmConfig() {
  const apiKey = process.env.AX_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
  if (!apiKey) {
    throw new Error('LLM scaffold in real mode requires AX_API_KEY or OPENAI_API_KEY.');
  }
  return {
    provider: process.env.AX_PROVIDER ?? 'openai',
    apiKey,
    apiURL: process.env.AX_BASE_URL,
    model: process.env.AX_FORGE_MODEL ?? process.env.AX_MODEL ?? 'gpt-4o-mini',
    temperature: Number(process.env.AX_FORGE_TEMPERATURE ?? 0.2),
  };
}

function createForgeLlm(ax: typeof import('@ax-llm/ax')) {
  const config = resolveForgeLlmConfig();
  return ax.ai({
    name: config.provider,
    apiKey: config.apiKey,
    ...(config.apiURL ? { apiURL: config.apiURL } : {}),
    config: { model: config.model, temperature: config.temperature },
  } as never);
}

export async function llmScaffoldDraft(input: {
  intake: ForgeIntake;
  agentId: string;
  name: string;
  mode: ForgeScaffoldMode;
}): Promise<{ draft: { agentConfig: AgentConfig; evalCases: ForgeEvalCaseDraft[] }; meta: ForgeDraftMeta }> {
  const heuristicConfig = scaffoldAgentConfig({
    intake: input.intake,
    agentId: input.agentId,
    name: input.name,
  });
  const heuristicCases = seedEvalCases(input.intake);
  const heuristicDraft = {
    agentConfig: heuristicConfig,
    evalCases: heuristicCases,
  };

  const prompt = buildIntakeSummary(input.intake);
  const at = new Date().toISOString();

  if (input.mode === 'mock') {
    const draft = mockLlmScaffoldDraft(input);
    return {
      draft,
      meta: {
        strategy: 'llm',
        mode: 'mock',
        usedFallback: false,
        prompt,
        rawOutput: { source: 'mockLlmScaffoldDraft' },
        model: 'mock',
        at,
      },
    };
  }

  const ax = await import('@ax-llm/ax');
  const llm = createForgeLlm(ax);
  const program = ax.ax(FORGE_SCAFFOLD_SIGNATURE, {
    description: [
      'You scaffold AxPlane agents from operator intake.',
      'Return scaffoldJson as strict JSON only.',
      'Pick tools only from hostToolCatalog qualifiedName values.',
      'evalCases must include taskText and criteria compatible with deterministic eval scoring.',
      'Include at least one adversarial case tied to the failure constraint.',
    ].join(' '),
  });

  const raw = await program.forward(llm, {
    intakeSummary: prompt,
    hostToolCatalog: hostToolCatalogJson(),
    heuristicDraft: JSON.stringify(heuristicDraft),
  });

  const scaffoldJson = String((raw as { scaffoldJson?: string }).scaffoldJson ?? '').trim();
  const llmOutput = parseLlmScaffoldJson(scaffoldJson);
  const draft = applyLlmScaffoldOutput({
    intake: input.intake,
    agentId: input.agentId,
    name: input.name,
    llm: llmOutput,
    heuristicConfig,
  });

  const config = resolveForgeLlmConfig();
  return {
    draft,
    meta: {
      strategy: 'llm',
      mode: 'real',
      usedFallback: false,
      prompt,
      rawOutput: raw,
      model: config.model,
      at,
    },
  };
}

export async function buildForgeDraftWithStrategy(input: {
  intake: ForgeIntake;
  agentId: string;
  name: string;
  strategy?: ForgeScaffoldStrategy;
  mode?: ForgeScaffoldMode;
}): Promise<{
  draft: { agentConfig: AgentConfig; evalCases: ForgeEvalCaseDraft[] };
  meta: ForgeDraftMeta;
}> {
  const strategy = input.strategy ?? 'heuristic';
  const mode = input.mode ?? 'mock';

  if (strategy === 'heuristic') {
    const agentConfig = scaffoldAgentConfig({
      intake: input.intake,
      agentId: input.agentId,
      name: input.name,
    });
    const evalCases = seedEvalCases(input.intake);
    return {
      draft: { agentConfig, evalCases },
      meta: {
        strategy: 'heuristic',
        usedFallback: false,
        at: new Date().toISOString(),
      },
    };
  }

  try {
    return await llmScaffoldDraft({
      intake: input.intake,
      agentId: input.agentId,
      name: input.name,
      mode,
    });
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    const agentConfig = scaffoldAgentConfig({
      intake: input.intake,
      agentId: input.agentId,
      name: input.name,
    });
    const evalCases = seedEvalCases(input.intake);
    return {
      draft: { agentConfig, evalCases },
      meta: {
        strategy: 'llm',
        mode,
        usedFallback: true,
        fallbackReason,
        prompt: buildIntakeSummary(input.intake),
        at: new Date().toISOString(),
      },
    };
  }
}
