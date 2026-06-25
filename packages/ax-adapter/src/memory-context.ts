import type { AgentConfig } from '@axplane/agents';
import type { Repositories } from '@axplane/db';
import { injectRunMemory } from '@axplane/memory';

export async function resolveDescriptionWithMemoryKernel(
  repo: Repositories,
  runId: string,
  agentId: string,
  agentConfig: AgentConfig,
  taskText: string,
): Promise<string> {
  const memoryCfg = agentConfig.memory ?? { kernelInject: true, injectLimit: 5 };
  if (memoryCfg.kernelInject === false) return agentConfig.description;

  const kernel = await injectRunMemory(repo, {
    agentId,
    taskText,
    limit: memoryCfg.injectLimit ?? 5,
  });

  await repo.appendRunEvent(runId, 'memory.injected', {
    count: kernel.entries.length,
    entries: kernel.entries.map((entry) => ({
      id: entry.id,
      agentId: entry.agentId,
      content: entry.content,
      tags: entry.tags,
    })),
  });

  const hasMemoryTools = agentConfig.tools.some((tool) => tool.startsWith('memory.'));
  const memoryHint = hasMemoryTools
    ? '\n\nUse memory.search before answering questions about past facts. Use memory.save when the user states a durable fact or decision.'
    : '';

  if (kernel.entries.length === 0) return agentConfig.description + memoryHint;

  return `${agentConfig.description}\n\n## Recalled memories (auto-injected at run start)\n${kernel.promptBlock}${memoryHint}`;
}
