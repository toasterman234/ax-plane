import type { AgentConfig } from '@axplane/agents';
import type { OptimizeAgentInput, OptimizeAgentResult } from './types';

const LAB_MARKER = '[Agent Lab optimized]';

export function mockOptimizeAgent(input: OptimizeAgentInput): OptimizeAgentResult {
  const { agentConfig, optimizerType } = input;
  if (optimizerType !== 'ax-native-mock') {
    throw new Error(`Mock optimizer cannot handle type: ${optimizerType}`);
  }

  const description = agentConfig.description.includes(LAB_MARKER)
    ? agentConfig.description
    : `${agentConfig.description.trim()} ${LAB_MARKER}`.trim();

  const candidateConfig: AgentConfig = {
    ...agentConfig,
    description,
    contextPolicy: {
      preset: 'lean',
      budget: 'tight',
    },
    memory: {
      ...agentConfig.memory,
      injectLimit: Math.max(1, (agentConfig.memory?.injectLimit ?? 5) - 1),
    },
  };

  const artifactText = [
    'Mock optimization applied:',
    '- tightened context policy to lean/tight',
    '- reduced memory inject limit by 1',
    `- tagged description with "${LAB_MARKER}"`,
  ].join('\n');

  return {
    candidateConfig,
    artifactText,
    metrics: {
      optimizer: 'ax-native-mock',
      changedFields: ['description', 'contextPolicy', 'memory.injectLimit'],
    },
  };
}
