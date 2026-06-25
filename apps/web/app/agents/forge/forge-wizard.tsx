'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ToolIntent = 'read' | 'write' | 'shell' | 'http' | 'memory';

type ForgeIntake = {
  task?: string;
  success?: string;
  failure?: string;
  tools?: ToolIntent[];
  judgment?: 'exact' | 'rubric';
  volume?: 'low' | 'high';
  successExample?: string;
  optimizeRequested?: boolean;
  memoryInject?: boolean;
};

type ForgeEvalCaseDraft = {
  name: string;
  taskText: string;
  criteria: unknown[];
  sortOrder: number;
};

type ForgeDraft = {
  agentConfig: {
    id: string;
    name: string;
    signature: string;
    mode: string;
    tools: string[];
    description: string;
  };
  evalCases: ForgeEvalCaseDraft[];
};

type ForgeSession = {
  id: string;
  status: string;
  intakeJson: ForgeIntake;
  draftJson: ForgeDraft | null;
  draftMetaJson?: ForgeDraftMeta | null;
  agentId: string | null;
  suiteId: string | null;
  error: string | null;
};

type ForgeDraftMeta = {
  strategy: 'heuristic' | 'llm';
  mode?: 'mock' | 'real';
  usedFallback: boolean;
  fallbackReason?: string;
  model?: string;
  at: string;
};

type EvalRunSummary = {
  caseCount: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  mode: string;
};

type CommitResponse = {
  agentId: string;
  suiteId: string;
  baselineEvalRunId?: string;
  session: ForgeSession;
  links: Record<string, string>;
  baselineEvalRun?: {
    id: string;
    summaryJson: EvalRunSummary | null;
    status: string;
  } | null;
};

type OptimizeResponse = {
  optimizationRunId: string;
  candidateId: string;
  baselineSummary: EvalRunSummary;
  candidateSummary: EvalRunSummary;
  session: ForgeSession;
};

const TOOL_OPTIONS: Array<{ id: ToolIntent; label: string }> = [
  { id: 'read', label: 'Read — repo, docs, lookup' },
  { id: 'write', label: 'Write — repo files (approval-gated)' },
  { id: 'shell', label: 'Shell (approval-gated)' },
  { id: 'memory', label: 'Memory kernel' },
  { id: 'http', label: 'HTTP custom tools (if configured)' },
];

const STEPS = ['intake', 'review', 'results'] as const;
type Step = (typeof STEPS)[number];

function slugifyId(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
  const normalized = slug.match(/^[a-z]/) ? slug : `a_${slug}`;
  return normalized.length >= 3 ? normalized : `${normalized}_agent`.slice(0, 63);
}

function parseApiError(err: unknown): string {
  if (!(err instanceof Error)) return 'Request failed';
  const raw = err.message;
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(raw.slice(jsonStart)) as { error?: string; issues?: unknown };
      if (body.error?.includes('forge_sessions') || body.error?.includes('draft_meta_json')) {
        return 'Database migration missing. From axplane run: pnpm db:migrate (needs 0006_forge_sessions.sql and 0007_forge_draft_meta.sql), then restart the API.';
      }
      if (body.error) return body.error;
    } catch {
      // fall through
    }
  }
  return raw;
}

function intakeFromSession(session: ForgeSession | null): ForgeIntake {
  return {
    tools: ['read'],
    judgment: 'rubric',
    volume: 'low',
    optimizeRequested: false,
    memoryInject: true,
    ...session?.intakeJson,
  };
}

export function ForgeWizard() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');

  const [step, setStep] = useState<Step>('intake');
  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [session, setSession] = useState<ForgeSession | null>(null);
  const [draft, setDraft] = useState<ForgeDraft | null>(null);
  const [intake, setIntake] = useState<ForgeIntake>({ tools: ['read'] });
  const [agentId, setAgentId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [runBaseline, setRunBaseline] = useState(true);
  const [mode, setMode] = useState<'mock' | 'real'>('mock');
  const [scaffoldStrategy, setScaffoldStrategy] = useState<'heuristic' | 'llm'>('heuristic');
  const [scaffoldMeta, setScaffoldMeta] = useState<ForgeDraftMeta | null>(null);
  const [optimizerType, setOptimizerType] = useState<'ax-native-mock' | 'ax-native'>('ax-native-mock');
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncUrl = useCallback((id: string) => {
    const next = `/agents/forge?session=${id}`;
    if (typeof window !== 'undefined' && window.location.search !== `?session=${id}`) {
      window.history.replaceState(null, '', next);
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const data = await api<{ session: ForgeSession; draft?: ForgeDraft }>(`/forge/sessions/${id}`);
    setSession(data.session);
    setDraft(data.session.draftJson);
    setScaffoldMeta(data.session.draftMetaJson ?? null);
    const merged = intakeFromSession(data.session);
    setIntake(merged);
    if (data.session.draftJson) {
      setAgentId(data.session.draftJson.agentConfig.id);
      setAgentName(data.session.draftJson.agentConfig.name);
    } else if (merged.task) {
      setAgentName(merged.task.slice(0, 64));
      setAgentId(slugifyId(merged.task.slice(0, 40)));
    }
    if (data.session.status === 'committed' || data.session.status === 'done' || data.session.status === 'optimizing') {
      setStep('results');
      if (data.session.agentId && data.session.suiteId) {
        setCommitResult({
          agentId: data.session.agentId,
          suiteId: data.session.suiteId,
          session: data.session,
          links: {},
        });
      }
    } else if (data.session.status === 'scaffolded' || data.session.draftJson) {
      setStep('review');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      setError(null);
      try {
        if (sessionParam) {
          setSessionId(sessionParam);
          await loadSession(sessionParam);
        } else {
          const created = await api<{ session: ForgeSession }>('/forge/sessions', {
            method: 'POST',
            body: JSON.stringify({}),
          });
          if (cancelled) return;
          setSessionId(created.session.id);
          setSession(created.session);
          setIntake(intakeFromSession(created.session));
          syncUrl(created.session.id);
        }
      } catch (err) {
        if (!cancelled) setError(parseApiError(err));
      } finally {
        setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionParam, loadSession, syncUrl]);

  const stepIndex = STEPS.indexOf(step);
  const resultsAgentId = commitResult?.agentId ?? session?.agentId ?? null;
  const resultsSuiteId = commitResult?.suiteId ?? session?.suiteId ?? null;

  const toolSet = useMemo(() => new Set(intake.tools ?? ['read']), [intake.tools]);

  function toggleTool(tool: ToolIntent) {
    setIntake((prev) => {
      const current = new Set(prev.tools ?? ['read']);
      if (current.has(tool)) current.delete(tool);
      else current.add(tool);
      if (current.size === 0) current.add('read');
      return { ...prev, tools: [...current] as ToolIntent[] };
    });
  }

  async function saveIntake() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ session: ForgeSession }>(`/forge/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ intake }),
      });
      setSession(data.session);
      setMessage('Intake saved');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function goToReview() {
    if (!sessionId) return;
    if (!intake.task?.trim() || !intake.success?.trim() || !intake.failure?.trim()) {
      setError('Task, success criteria, and failure constraints are required.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/forge/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ intake }),
      });
      const name = agentName.trim() || intake.task.slice(0, 64);
      const id = agentId.trim() || slugifyId(name);
      const scaffolded = await api<{ session: ForgeSession; draft: ForgeDraft; scaffoldMeta?: ForgeDraftMeta }>(
        `/forge/sessions/${sessionId}/scaffold?strategy=${scaffoldStrategy}`,
        {
          method: 'POST',
          body: JSON.stringify({ agentId: id, name, strategy: scaffoldStrategy, mode }),
        },
      );
      setSession(scaffolded.session);
      setDraft(scaffolded.draft);
      setScaffoldMeta(scaffolded.scaffoldMeta ?? scaffolded.session.draftMetaJson ?? null);
      setAgentId(scaffolded.draft.agentConfig.id);
      setAgentName(scaffolded.draft.agentConfig.name);
      setStep('review');
      setMessage(
        scaffolded.scaffoldMeta?.usedFallback
          ? 'Draft scaffolded with heuristic fallback — review before commit'
          : scaffoldStrategy === 'llm'
            ? `LLM draft scaffolded (${scaffolded.scaffoldMeta?.mode ?? mode}) — review before commit`
            : 'Draft scaffolded — review before commit',
      );
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<CommitResponse>(`/forge/sessions/${sessionId}/commit`, {
        method: 'POST',
        body: JSON.stringify({
          agentId: agentId.trim(),
          name: agentName.trim(),
          runBaseline,
          mode,
        }),
      });
      setCommitResult(result);
      setSession(result.session);
      setStep('results');
      setMessage('Agent and eval suite created');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function optimize() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<OptimizeResponse>(`/forge/sessions/${sessionId}/optimize`, {
        method: 'POST',
        body: JSON.stringify({
          optimizerType,
          mode: optimizerType === 'ax-native' ? 'real' : mode,
        }),
      });
      setOptimizeResult(result);
      setSession(result.session);
      setMessage(
        `Optimized: ${result.baselineSummary.averageScore}% → ${result.candidateSummary.averageScore}%`,
      );
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function startOver() {
    setError(null);
    setMessage(null);
    setCommitResult(null);
    setOptimizeResult(null);
    setDraft(null);
    setScaffoldMeta(null);
    setStep('intake');
    const created = await api<{ session: ForgeSession }>('/forge/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setSessionId(created.session.id);
    setSession(created.session);
    setIntake(intakeFromSession(created.session));
    setAgentId('');
    setAgentName('');
    syncUrl(created.session.id);
  }

  if (booting) {
    return <p className="text-sm text-muted-foreground">Starting forge session…</p>;
  }

  if (error && !sessionId) {
    return (
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Agent Forge</h2>
        <p className="text-sm text-red-400">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {sessionId ? (
        <p className="font-mono text-xs text-muted-foreground">session {sessionId}</p>
      ) : null}
      {session?.status ? (
        <p className="text-xs text-muted-foreground">status: {session.status}</p>
      ) : null}

      <div className="flex gap-2">
        {STEPS.map((id, index) => (
          <div
            key={id}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              step === id
                ? 'bg-secondary text-secondary-foreground'
                : index < stepIndex
                  ? 'text-emerald-400'
                  : 'text-muted-foreground'
            }`}
          >
            {index + 1}. {id}
          </div>
        ))}
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {session?.error ? <p className="text-sm text-red-400">Session error: {session.error}</p> : null}

      {step === 'intake' ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">What should this agent do?</h2>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Task</span>
            <textarea
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
              rows={3}
              value={intake.task ?? ''}
              onChange={(e) => setIntake((p) => ({ ...p, task: e.target.value }))}
              placeholder="Summarize repository documentation for operators…"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Success looks like</span>
            <textarea
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
              rows={2}
              value={intake.success ?? ''}
              onChange={(e) => setIntake((p) => ({ ...p, success: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Must not / failure mode</span>
            <textarea
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
              rows={2}
              value={intake.failure ?? ''}
              onChange={(e) => setIntake((p) => ({ ...p, failure: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Success example (optional)</span>
            <textarea
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
              rows={2}
              value={intake.successExample ?? ''}
              onChange={(e) => setIntake((p) => ({ ...p, successExample: e.target.value }))}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs uppercase tracking-wide text-muted-foreground">Tools</legend>
            {TOOL_OPTIONS.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={toolSet.has(opt.id)}
                  onChange={() => toggleTool(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Judgment</span>
              <select
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                value={intake.judgment ?? 'rubric'}
                onChange={(e) => setIntake((p) => ({ ...p, judgment: e.target.value as 'exact' | 'rubric' }))}
              >
                <option value="rubric">Rubric / fuzzy</option>
                <option value="exact">Exact match</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Volume</span>
              <select
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                value={intake.volume ?? 'low'}
                onChange={(e) => setIntake((p) => ({ ...p, volume: e.target.value as 'low' | 'high' }))}
              >
                <option value="low">Low — balanced context</option>
                <option value="high">High — lean context</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={intake.optimizeRequested ?? false}
              onChange={(e) => setIntake((p) => ({ ...p, optimizeRequested: e.target.checked }))}
            />
            Request real optimize later (sets agent mode to RLM)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={intake.memoryInject ?? true}
              onChange={(e) => setIntake((p) => ({ ...p, memoryInject: e.target.checked }))}
            />
            Inject memory kernel at run start
          </label>
          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-3">
            <h3 className="text-sm font-medium">Scaffold strategy</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Draft source</span>
                <select
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                  value={scaffoldStrategy}
                  onChange={(e) => setScaffoldStrategy(e.target.value as 'heuristic' | 'llm')}
                >
                  <option value="heuristic">Heuristic — deterministic templates</option>
                  <option value="llm">LLM-assisted — better signatures and eval cases</option>
                </select>
              </label>
              {scaffoldStrategy === 'llm' ? (
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">LLM mode</span>
                  <select
                    className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'mock' | 'real')}
                  >
                    <option value="mock">Mock — no API keys</option>
                    <option value="real">Real — requires AX_API_KEY / OPENAI_API_KEY</option>
                  </select>
                </label>
              ) : null}
            </div>
            {scaffoldStrategy === 'llm' ? (
              <p className="text-xs text-muted-foreground">
                LLM scaffold falls back to heuristics if parsing fails or keys are missing in real mode.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-secondary text-secondary-foreground hover:opacity-90"
              onClick={saveIntake}
              disabled={loading}
            >
              Save draft
            </Button>
            <Button onClick={goToReview} disabled={loading}>
              {loading ? 'Scaffolding…' : 'Review draft →'}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'review' && draft ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Review scaffold</h2>
          {scaffoldMeta ? (
            <p className="text-xs text-muted-foreground">
              Scaffold: {scaffoldMeta.strategy}
              {scaffoldMeta.mode ? ` (${scaffoldMeta.mode})` : ''}
              {scaffoldMeta.usedFallback ? ' — fell back to heuristics' : ''}
              {scaffoldMeta.model ? ` · model ${scaffoldMeta.model}` : ''}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Agent id</span>
              <input
                className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Display name</span>
              <input
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                value={agentName}
                onChange={(e) => {
                  setAgentName(e.target.value);
                  if (!agentId || agentId === slugifyId(agentName)) {
                    setAgentId(slugifyId(e.target.value));
                  }
                }}
              />
            </label>
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm space-y-2">
            <div><span className="text-muted-foreground">Mode:</span> {draft.agentConfig.mode}</div>
            <div><span className="text-muted-foreground">Signature:</span>{' '}
              <code className="text-xs">{draft.agentConfig.signature}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Tools:</span>{' '}
              {draft.agentConfig.tools.join(', ')}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Eval cases ({draft.evalCases.length})</h3>
            <ul className="space-y-2 text-sm">
              {draft.evalCases.map((c) => (
                <li key={c.sortOrder} className="rounded-md border border-border p-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-muted-foreground text-xs mt-1 line-clamp-2">{c.taskText}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={runBaseline}
                onChange={(e) => setRunBaseline(e.target.checked)}
              />
              Run baseline eval on commit
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Mode</span>
              <select
                className="rounded-md border border-border bg-muted px-2 py-1 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'mock' | 'real')}
              >
                <option value="mock">mock</option>
                <option value="real">real</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-secondary text-secondary-foreground hover:opacity-90"
              onClick={() => setStep('intake')}
              disabled={loading}
            >
              ← Edit intake
            </Button>
            <Button onClick={commit} disabled={loading}>
              {loading ? 'Committing…' : 'Commit agent + suite'}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'results' && resultsAgentId && resultsSuiteId ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Created</h2>
          <p className="text-sm">
            Agent <strong>{resultsAgentId}</strong> and eval suite are ready.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/agents/${resultsAgentId}`} className="text-accent-foreground hover:underline">
              Open agent editor →
            </Link>
            <Link href="/agents/eval" className="text-accent-foreground hover:underline">
              Eval lab →
            </Link>
          </div>
          {commitResult?.baselineEvalRun?.summaryJson ? (
            <p className="text-sm text-muted-foreground">
              Baseline: {commitResult.baselineEvalRun.summaryJson.passedCases}/
              {commitResult.baselineEvalRun.summaryJson.caseCount} passed · avg{' '}
              {commitResult.baselineEvalRun.summaryJson.averageScore}%
            </p>
          ) : null}
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-sm font-medium">Optional optimize</h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="rounded-md border border-border bg-muted px-2 py-1 text-sm"
                value={optimizerType}
                onChange={(e) => setOptimizerType(e.target.value as 'ax-native-mock' | 'ax-native')}
              >
                <option value="ax-native-mock">Mock optimizer</option>
                <option value="ax-native">ax-native (real, RLM only)</option>
              </select>
              <Button onClick={optimize} disabled={loading}>
                {loading ? 'Optimizing…' : 'Run optimize'}
              </Button>
            </div>
            {optimizeResult ? (
              <p className="text-sm text-emerald-400">
                Candidate {optimizeResult.candidateId.slice(0, 8)}… — promote in Agent Lab.
              </p>
            ) : null}
            {commitResult?.agentId ?? resultsAgentId ? (
              <Link
                href={`/agents/${commitResult?.agentId ?? resultsAgentId}`}
                className="inline-block text-sm text-accent-foreground hover:underline"
              >
                Agent Lab (Editor → Lab tab) for compare / promote →
              </Link>
            ) : null}
          </div>
          <Button
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={startOver}
            disabled={loading}
          >
            Start new forge session
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
