import type { RunStatus } from '@axplane/events';
import type { CaseScore, CriterionResult, EvalCriterion } from './types';

export type EvalRunSnapshot = {
  status: RunStatus;
  outputJson: unknown;
  error?: string | null;
  events: Array<{ type: string; payloadJson?: unknown }>;
  toolCalls: Array<{ qualifiedName: string; status: string }>;
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
