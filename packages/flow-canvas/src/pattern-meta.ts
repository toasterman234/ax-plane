import type { FlowEntry } from './types';

export type PatternId =
  | 'classify-and-act'
  | 'fanout-and-synthesize'
  | 'adversarial-verification'
  | 'generate-and-filter'
  | 'tournament'
  | 'loop-until-done';

export type PatternSource = 'corpus' | 'custom' | 'builder';

export type FlowCatalogFilter = 'all' | PatternSource;

export const PATTERN_LABELS: Record<PatternId, string> = {
  'classify-and-act': 'Classify And Act',
  'fanout-and-synthesize': 'Fanout And Synthesize',
  'adversarial-verification': 'Adversarial Verification',
  'generate-and-filter': 'Generate And Filter',
  tournament: 'Tournament',
  'loop-until-done': 'Loop Until Done',
};

/** Operator-facing one-liner per canonical topology. */
export const PATTERN_BLURBS: Record<PatternId, string> = {
  'classify-and-act':
    'A classifier labels each item, then routes to exactly one handler — or escalates when confidence is low or content is sensitive.',
  'fanout-and-synthesize':
    'Independent branches run in parallel, a barrier waits for all of them, then one synthesis step merges every result.',
  'adversarial-verification':
    'A producer emits findings; independent refuters try to disprove each; only strict-minority survivors are kept.',
  'generate-and-filter':
    'Many generators fan out for breadth; one rubric pass scores, dedupes, and keeps the best k — discarding the rest.',
  tournament:
    'Distinct attempts compete in judged pairwise rounds until one champion remains.',
  'loop-until-done':
    'Loop discovery until a dry-streak stop predicate fires, with a max-rounds safety rail.',
};

export function resolvePatternSource(entry: FlowEntry): PatternSource {
  if (entry.patternSource) return entry.patternSource;
  if (entry.id.startsWith('pattern-')) return 'corpus';
  return 'custom';
}

export function patternLabel(pattern: string | undefined): string | null {
  if (!pattern) return null;
  return (PATTERN_LABELS as Record<string, string>)[pattern] ?? pattern;
}

export function patternBlurb(pattern: string | undefined): string | null {
  if (!pattern) return null;
  return (PATTERN_BLURBS as Record<string, string>)[pattern] ?? null;
}

export function matchesCatalogFilter(entry: FlowEntry, filter: FlowCatalogFilter): boolean {
  if (filter === 'all') return true;
  return resolvePatternSource(entry) === filter;
}

export function compareFlowCatalogEntries(a: FlowEntry, b: FlowEntry): number {
  const aCorpus = resolvePatternSource(a) === 'corpus' ? 0 : 1;
  const bCorpus = resolvePatternSource(b) === 'corpus' ? 0 : 1;
  if (aCorpus !== bCorpus) return aCorpus - bCorpus;
  const aPattern = a.pattern ?? '';
  const bPattern = b.pattern ?? '';
  if (aPattern !== bPattern) return aPattern.localeCompare(bPattern);
  return (a.title || a.id).localeCompare(b.title || b.id);
}

export function groupFlowCatalogEntries(
  flows: FlowEntry[],
): { corpus: FlowEntry[]; other: FlowEntry[] } {
  const sorted = [...flows].sort(compareFlowCatalogEntries);
  const corpus: FlowEntry[] = [];
  const other: FlowEntry[] = [];
  for (const flow of sorted) {
    if (resolvePatternSource(flow) === 'corpus') corpus.push(flow);
    else other.push(flow);
  }
  return { corpus, other };
}
