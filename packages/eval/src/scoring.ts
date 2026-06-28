import type { RunStatus } from '@axplane/events';
import type { CaseScore, CriterionResult, EvalCriterion } from './types';

export type EvalRunSnapshot = {
  status: RunStatus;
  outputJson: unknown;
  error?: string | null;
  events: Array<{ type: string; payloadJson?: unknown }>;
  toolCalls: Array<{ qualifiedName: string; status: string }>;
  /** Slice E — optional routing trace for visual criteria. */
  routeTier?: string | null;
  delegates?: string[];
  mapNodesVisited?: string[];
};

function readField(output: unknown, field: string): string {
  if (!output || typeof output !== 'object') return '';
  const value = (output as Record<string, unknown>)[field];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(' ');
  return value === undefined || value === null ? '' : JSON.stringify(value);
}

function outputText(output: unknown, field?: string): string {
  if (field) return readField(output, field);
  if (!output || typeof output !== 'object') return String(output ?? '');
  const record = output as Record<string, unknown>;
  const parts = ['answer', 'nextActions', 'text', 'response']
    .map((key) => readField(record, key))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : JSON.stringify(output);
}

function normDelegate(name: string): string {
  return name.trim().toLowerCase();
}

function matchesDelegate(actual: string, expected: string): boolean {
  const a = normDelegate(actual);
  const e = normDelegate(expected);
  return a === e || a.endsWith(`.${e.split('.').pop()}`);
}

function normalizeRouteTier(route?: string | null): string | undefined {
  if (!route) return undefined;
  const r = route.trim();
  if (['trivial', 'personal_fact', 'simple_direct', 'complex_agentic'].includes(r)) return r;
  if (/^(greet|trivial)/i.test(r)) return 'trivial';
  if (/fact/i.test(r)) return 'personal_fact';
  if (/(direct|simple)/i.test(r)) return 'simple_direct';
  return 'complex_agentic';
}

function evaluateCriterion(snapshot: EvalRunSnapshot, criterion: EvalCriterion): CriterionResult {
  switch (criterion.type) {
    case 'run_completed':
      return {
        criterion,
        passed: snapshot.status === 'completed',
        message: snapshot.status === 'completed'
          ? 'Run completed'
          : `Expected completed, got ${snapshot.status}`,
      };
    case 'run_status': {
      const passed = snapshot.status === criterion.status;
      return {
        criterion,
        passed,
        message: passed
          ? `Run status is ${criterion.status}`
          : `Expected ${criterion.status}, got ${snapshot.status}`,
      };
    }
    case 'output_contains': {
      const haystack = outputText(snapshot.outputJson, criterion.field);
      const needle = criterion.text;
      const passed = criterion.caseInsensitive
        ? haystack.toLowerCase().includes(needle.toLowerCase())
        : haystack.includes(needle);
      return {
        criterion,
        passed,
        message: passed
          ? `Output contains "${needle}"`
          : `Output missing "${needle}"`,
      };
    }
    case 'tool_called': {
      const passed = snapshot.toolCalls.some((tool) => tool.qualifiedName === criterion.qualifiedName);
      return {
        criterion,
        passed,
        message: passed
          ? `Tool ${criterion.qualifiedName} was called`
          : `Tool ${criterion.qualifiedName} was not called`,
      };
    }
    case 'event_type': {
      const passed = snapshot.events.some((event) => event.type === criterion.eventType);
      return {
        criterion,
        passed,
        message: passed
          ? `Event ${criterion.eventType} present`
          : `Event ${criterion.eventType} missing`,
      };
    }
    case 'route_tier': {
      const actual = normalizeRouteTier(snapshot.routeTier);
      const passed = actual === criterion.tier;
      return {
        criterion,
        passed,
        message: passed
          ? `Route tier is ${criterion.tier}`
          : `Expected route tier ${criterion.tier}, got ${actual ?? 'none'}`,
      };
    }
    case 'delegate_first': {
      const first = snapshot.delegates?.[0];
      const passed = Boolean(first && matchesDelegate(first, criterion.qualifiedName));
      return {
        criterion,
        passed,
        message: passed
          ? `First delegate was ${criterion.qualifiedName}`
          : `Expected first delegate ${criterion.qualifiedName}, got ${first ?? 'none'}`,
      };
    }
    case 'path_includes': {
      const visited = snapshot.mapNodesVisited ?? [];
      const passed = visited.includes(criterion.nodeId);
      return {
        criterion,
        passed,
        message: passed
          ? `Path includes ${criterion.nodeId}`
          : `Path missing expected node ${criterion.nodeId} (saw: ${visited.join(', ') || 'none'})`,
      };
    }
    case 'path_excludes': {
      const visited = snapshot.mapNodesVisited ?? [];
      const passed = !visited.includes(criterion.nodeId);
      return {
        criterion,
        passed,
        message: passed
          ? `Path excludes ${criterion.nodeId}`
          : `Path must not include ${criterion.nodeId}`,
      };
    }
    default:
      return {
        criterion: criterion as EvalCriterion,
        passed: false,
        message: 'Unknown criterion type',
      };
  }
}

export function scoreEvalCase(snapshot: EvalRunSnapshot, criteria: EvalCriterion[]): CaseScore {
  const results = criteria.map((criterion) => evaluateCriterion(snapshot, criterion));
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  return {
    passed,
    total,
    score: total === 0 ? 100 : Math.round((passed / total) * 100),
    results,
  };
}

export function summarizeEvalCases(caseScores: Array<{ name: string; score: CaseScore; passed: boolean }>) {
  const caseCount = caseScores.length;
  const passedCases = caseScores.filter((row) => row.passed).length;
  const failedCases = caseCount - passedCases;
  const averageScore = caseCount === 0
    ? 0
    : Math.round(caseScores.reduce((sum, row) => sum + row.score.score, 0) / caseCount);
  return { caseCount, passedCases, failedCases, averageScore };
}
