export type MemoryEntry = {
  id: string;
  agentId: string | null;
  runId: string | null;
  content: string;
  tags: string[];
  createdAt: Date | string;
};

export function scoreMemoryEntry(entry: MemoryEntry, query: string): number {
  const terms = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const hay = `${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (hay.includes(term)) score += 1;
  }
  for (const tag of entry.tags) {
    if (query.toLowerCase().includes(tag.toLowerCase())) score += 1;
  }
  return score;
}

export function rankMemoryEntries(entries: MemoryEntry[], query: string, limit = 5) {
  return entries
    .map((entry) => ({ entry, score: scoreMemoryEntry(entry, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.entry.createdAt).localeCompare(String(a.entry.createdAt)))
    .slice(0, limit)
    .map((row) => row.entry);
}

export function formatMemoriesForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return 'No relevant memories recalled.';
  return entries
    .map((entry, index) => {
      const scope = entry.agentId ? `agent:${entry.agentId}` : 'global';
      const tagText = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
      return `${index + 1}. (${scope}${tagText}) ${entry.content}`;
    })
    .join('\n');
}
