import type { RunStatus } from '@axplane/events';

export type EvalCriterion =
  | { type: 'run_completed' }
  | { type: 'run_status'; status: RunStatus }
  | { type: 'output_contains'; field?: string; text: string; caseInsensitive?: boolean }
  | { type: 'tool_called'; qualifiedName: string }
  | { type: 'event_type'; eventType: string }
  /** Slice E — router tier the conversation should take (dispatcher map). */
  | { type: 'route_tier'; tier: 'trivial' | 'personal_fact' | 'simple_direct' | 'complex_agentic' }
  /** Slice E — first delegate qualifiedName on the routing stream. */
  | { type: 'delegate_first'; qualifiedName: string }
  /** Slice E — front-door map node id that must appear on the path (e.g. `complex`, `loop`). */
  | { type: 'path_includes'; nodeId: string }
  /** Slice E — front-door map node id that must not appear. */
  | { type: 'path_excludes'; nodeId: string };

export type EvalCase = {
  id: string;
  name: string;
  taskText: string;
  criteria: EvalCriterion[];
  sortOrder: number;
};

export type EvalSuite = {
  id: string;
  name: string;
  description: string;
  cases: EvalCase[];
};

export type CriterionResult = {
  criterion: EvalCriterion;
  passed: boolean;
  message: string;
};

export type CaseScore = {
  passed: number;
  total: number;
  score: number;
  results: CriterionResult[];
};

export type EvalRunSummary = {
  caseCount: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  mode: 'mock' | 'real';
};
