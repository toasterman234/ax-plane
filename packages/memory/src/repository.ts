import type { MemoryEntry } from './scoring';

export type MemoryRepository = {
  createMemoryEntry(input: {
    agentId: string | null;
    runId: string | null;
    content: string;
    tags: string[];
  }): Promise<MemoryEntry>;
  listMemoryForAgent(agentId: string | null, limit?: number): Promise<MemoryEntry[]>;
};
