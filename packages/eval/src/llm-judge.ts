/**
 * LLM judge harness metadata (Slice F).
 * Ported from ax-sandbox `evals/run.ts` — the judge runs on ax-server during
 * `POST /evals/run`; AxPlane carries the contract + helpers for parity/tests.
 */

import { pickFlowOutputText } from './ax-flow-evals.js';

/** Role prompt for the ax `judge` signature. */
export const LLM_JUDGE_ROLE = [
  'You are a strict but fair evaluator of an AI flow output.',
  'You are given the flow input, the output it produced, and a plain-English description of what a correct output must satisfy.',
  'Decide whether the output satisfies the expectation. If the expectation states measurable constraints (counts, lengths, ranges), check them concretely.',
  'Pass only if the output genuinely meets the expectation. Give a short, specific reason — when failing, say exactly what fell short.',
].join(' ');

export const LLM_JUDGE_SIGNATURE =
  'taskInput:string, flowOutput:string, expected:string -> pass:boolean, reason:string';

export type LlmJudgeVerdict = {
  pass: boolean;
  reason: string;
};

export type LlmJudgeInput = {
  taskInput: string;
  flowOutput: string;
  expected: string;
};

/** Max chars stored per case output before judge (ax-sandbox GOT_MAX). */
export const LLM_JUDGE_OUTPUT_MAX = 20_000;

export function normalizeFlowOutputForJudge(output: unknown): string {
  return pickFlowOutputText(output).slice(0, LLM_JUDGE_OUTPUT_MAX);
}
