import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Minimal mirror of ax-sandbox `evals/dispatcher/types.ts` (case source of truth lives there). */
export type DispatcherRoutingCase = {
  id: string;
  rationale: string;
  prompt: string;
  slow?: boolean;
  path: 'dispatcher' | 'short-circuit' | 'either';
  expectFirst?: string | null;
  expectAny?: string[];
  expectSequence?: string[];
  forbid?: string[];
  allowDirect?: boolean;
  argsContain?: { flowId?: string };
  judgeAnswer?: (answer: string, delegates: string[], run: DispatcherRunResult) => string | null;
};

export type DispatcherRunResult = {
  path: 'dispatcher' | 'short-circuit';
  delegates: string[];
  delegateArgs: unknown[];
  answer: string;
  sawRoutingStatus: boolean;
  streamError?: string;
};

export type DispatcherCaseSummary = {
  id: string;
  rationale: string;
  prompt: string;
  slow?: boolean;
  path: string;
  expectFirst?: string | null;
  expectAny?: string[];
};

function sandboxEvalsDir(): string {
  const root = process.env.AX_SANDBOX_ROOT?.trim() || resolve(homedir(), 'ax/sandbox');
  return resolve(root, 'evals/dispatcher');
}

async function importSandboxModule<T>(filename: string): Promise<T> {
  const path = resolve(sandboxEvalsDir(), filename);
  if (!existsSync(path)) {
    throw new Error(`ax-sandbox eval module not found: ${path} (set AX_SANDBOX_ROOT)`);
  }
  return (await import(pathToFileURL(path).href)) as T;
}

let casesCache: DispatcherRoutingCase[] | null = null;

/** Load routing cases from ax-sandbox (issue #12 option a — ax-sandbox stays source of truth). */
export async function loadDispatcherRoutingCases(): Promise<DispatcherRoutingCase[]> {
  if (casesCache) return casesCache;
  const mod = await importSandboxModule<{ CASES: DispatcherRoutingCase[] }>('cases.ts');
  casesCache = mod.CASES ?? [];
  return casesCache;
}

export async function getDispatcherRoutingCase(caseId: string): Promise<DispatcherRoutingCase | null> {
  const cases = await loadDispatcherRoutingCases();
  return cases.find((c) => c.id === caseId) ?? null;
}

export function toCaseSummary(c: DispatcherRoutingCase): DispatcherCaseSummary {
  return {
    id: c.id,
    rationale: c.rationale,
    prompt: c.prompt,
    slow: c.slow,
    path: c.path,
    expectFirst: c.expectFirst,
    expectAny: c.expectAny,
  };
}

export async function loadDispatcherCaseSummaries(): Promise<DispatcherCaseSummary[]> {
  const cases = await loadDispatcherRoutingCases();
  return cases.map(toCaseSummary);
}

/** Score helper — delegates to ax-sandbox `score.ts` when available. */
export async function scoreRoutingCase(
  c: DispatcherRoutingCase,
  run: DispatcherRunResult,
): Promise<string | null> {
  const mod = await importSandboxModule<{ scoreCase: (c: DispatcherRoutingCase, run: DispatcherRunResult) => string | null }>(
    'score.ts',
  );
  return mod.scoreCase(c, run);
}
