import type { MemoryRepository } from './repository';
import { formatMemoriesForPrompt, rankMemoryEntries, type MemoryEntry } from './scoring';

export type MemoryKernelResult = {
  entries: MemoryEntry[];
  promptBlock: string;
};

export async function injectRunMemory(
  repo: MemoryRepository,
  input: { agentId: string; taskText: string; limit?: number },
): Promise<MemoryKernelResult> {
  const pool = await repo.listMemoryForAgent(input.agentId, 200);
  const entries = rankMemoryEntries(pool, input.taskText, input.limit ?? 5);
  return {
    entries,
    promptBlock: formatMemoriesForPrompt(entries),
  };
}
