import type { MemoryRepository } from './repository';
import { rankMemoryEntries } from './scoring';

const MEMORY_TOOLS = new Set(['memory.save', 'memory.search', 'memory.list']);

export function isMemoryTool(qualifiedName: string): boolean {
  return MEMORY_TOOLS.has(qualifiedName);
}

export async function executeMemoryTool(
  repo: MemoryRepository,
  input: {
    qualifiedName: string;
    args: Record<string, unknown>;
    agentId?: string | null;
    runId?: string | null;
  },
) {
  switch (input.qualifiedName) {
    case 'memory.save': {
      const content = String(input.args.content ?? '').trim();
      if (!content) throw new Error('memory.save requires non-empty content');
      const tags = Array.isArray(input.args.tags)
        ? input.args.tags.map((tag) => String(tag)).filter(Boolean)
        : [];
      const scope = input.args.scope === 'global' ? null : input.agentId ?? null;
      const entry = await repo.createMemoryEntry({
        agentId: scope,
        runId: input.runId ?? null,
        content,
        tags,
      });
      return { saved: true, entry };
    }
    case 'memory.search': {
      const query = String(input.args.query ?? '').trim();
      if (!query) throw new Error('memory.search requires query');
      const limit = Number(input.args.limit ?? 5);
      const pool = await repo.listMemoryForAgent(input.agentId ?? null, 200);
      const matches = rankMemoryEntries(pool, query, Number.isFinite(limit) ? limit : 5);
      return { count: matches.length, matches };
    }
    case 'memory.list': {
      const limit = Number(input.args.limit ?? 20);
      const entries = await repo.listMemoryForAgent(input.agentId ?? null, Number.isFinite(limit) ? limit : 20);
      return { count: entries.length, entries };
    }
    default:
      throw new Error(`Unknown memory tool: ${input.qualifiedName}`);
  }
}
