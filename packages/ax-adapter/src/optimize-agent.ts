import type { AgentConfig } from '@axplane/agents';
import type { EvalCriterion } from '@axplane/eval';
import { createLlm } from './create-llm';
import { resolveLlmConfig } from './llm-config';
import { buildEvalSafeAxFunctions } from './optimize-tools';
import { evalCaseToOptimizeTask } from './optimize-tasks';

export type OptimizeAxAgentInput = {
  agentConfig: AgentConfig;
  evalCases: Array<{ taskText: string; criteria: EvalCriterion[] }>;
  optimizerConfig?: {
    maxMetricCalls?: number;
    verbose?: boolean;
  };
};

export type OptimizeAxAgentResult = {
  candidateConfig: AgentConfig;
  artifactText: string;
  metrics: Record<string, unknown>;
};

function summarizeOptimizedProgram(program: unknown): string {
  if (program && typeof program === 'object' && 'componentMap' in program) {
    const map = (program as { componentMap?: Record<string, string> }).componentMap;
    if (map && Object.keys(map).length > 0) {
      return Object.keys(map).map((key) => `- tuned component: ${key}`).join('\n');
    }
  }
  return 'Optimized program artifact saved.';
}

export async function applyLabArtifactIfPresent(
  axAgent: { applyOptimization: (program: unknown) => void },
  agentConfig: AgentConfig,
) {
  if (!agentConfig.lab?.optimizedProgram) return;
  const ax = await import('@ax-llm/ax');
  const restored = ax.axDeserializeOptimizedProgram(
    agentConfig.lab.optimizedProgram as Parameters<typeof ax.axDeserializeOptimizedProgram>[0],
  );
  axAgent.applyOptimization(restored);
}

export async function optimizeAxAgent(input: OptimizeAxAgentInput): Promise<OptimizeAxAgentResult> {
  const { agentConfig } = input;

  if (agentConfig.runtime !== 'ax') {
    throw new Error('ax-native optimization requires runtime "ax"');
  }
  if (agentConfig.mode !== 'rlm') {
    throw new Error('ax-native optimization currently requires agent mode "rlm" (agent() pipeline)');
  }
  if (input.evalCases.length === 0) {
    throw new Error('Eval suite must have at least one case for optimization');
  }

  const ax = await import('@ax-llm/ax');
  const { agent, AxJSRuntime, axSerializeOptimizedProgram } = ax;
  const studentAI = createLlm(ax, resolveLlmConfig(agentConfig));

  let judgeAI = studentAI;
  try {
    judgeAI = createLlm(ax, resolveLlmConfig(agentConfig, 'fallback'));
  } catch {
    // fallback to student model when no separate judge config exists
  }

  const functions = buildEvalSafeAxFunctions(agentConfig.tools);
  const tasks = input.evalCases.map(evalCaseToOptimizeTask);
  const maxMetricCalls = input.optimizerConfig?.maxMetricCalls
    ?? Number(process.env.AXPLANE_OPTIMIZE_MAX_METRIC_CALLS ?? 12);

  const axAgent = agent(agentConfig.signature, {
    ai: studentAI,
    judgeAI,
    agentIdentity: { name: agentConfig.name, description: agentConfig.description },
    contextFields: agentConfig.contextFields ?? [],
    runtime: new AxJSRuntime(),
    functions,
    contextPolicy: (agentConfig.contextPolicy ?? { preset: 'checkpointed', budget: 'balanced' }) as never,
    judgeOptions: {
      description: 'Prefer correct tool use, safe completion, and answers that satisfy the criteria.',
    },
  });

  const result = await axAgent.optimize(tasks, {
    maxMetricCalls,
    verbose: input.optimizerConfig?.verbose ?? false,
    apply: false,
  });

  const optimizedProgram = result.optimizedProgram;
  if (!optimizedProgram) {
    throw new Error('Ax optimization finished without an optimizedProgram artifact');
  }

  const serialized = axSerializeOptimizedProgram(optimizedProgram);
  const summary = summarizeOptimizedProgram(optimizedProgram);

  const candidateConfig: AgentConfig = {
    ...agentConfig,
    lab: {
      optimizerType: 'ax-native',
      optimizedProgram: serialized,
      optimizedProgramSummary: summary,
    },
  };

  return {
    candidateConfig,
    artifactText: [
      'Ax native optimization complete.',
      `Tasks: ${tasks.length}`,
      `maxMetricCalls: ${maxMetricCalls}`,
      summary,
    ].join('\n'),
    metrics: {
      optimizer: 'ax-native',
      maxMetricCalls,
      taskCount: tasks.length,
      paretoFrontSize: Array.isArray(result.paretoFront) ? result.paretoFront.length : 0,
    },
  };
}
