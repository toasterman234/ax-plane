'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API_URL, api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  deriveActorTurns,
  deriveApprovals,
  deriveToolCalls,
  latestPayload,
  statusTone,
  toolStatusTone,
  approvalStatusTone,
  type RunEvent,
} from './run-detail-derive';
import {
  deriveAxFlowTraceOverlay,
  isAxFlowRun,
  isAxDispatcherRun,
  isGraphParentRun,
  readAxFlowRunInput,
} from '@axplane/flow-canvas';
import { GraphRunCanvasPanel } from './graph-run-canvas';
import { AxFlowRunCanvasPanel } from './ax-flow-run-canvas';
import { DispatcherRunCanvasPanel } from './dispatcher-run-canvas';

type Run = {
  id: string;
  status: string;
  inputJson: unknown;
  outputJson?: unknown;
  error?: string;
  agentId?: string;
  runKind?: string;
  parentRunId?: string | null;
  stepKey?: string | null;
  createdAt?: string;
};

type RunResponse = { run: Run; events: RunEvent[]; children?: Run[] };

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <span className="text-xs text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </Card>
  );
}

export function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [children, setChildren] = useState<Run[]>([]);

  useEffect(() => {
    api<RunResponse>(`/runs/${runId}`).then((data) => {
      setRun(data.run);
      setEvents(data.events);
      setChildren(data.children ?? []);
    });
  }, [runId]);

  useEffect(() => {
    const source = new EventSource(`${API_URL}/runs/${runId}/stream`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      setEvents((current) =>
        current.some((e) => e.id === event.id) ? current : [...current, event].sort((a, b) => a.seq - b.seq),
      );
      if (['run.completed', 'run.failed', 'run.cancelled', 'run.status', 'graph.completed', 'graph.step.completed', 'graph.step.started', 'graph.failed', 'axflow.step.started', 'axflow.step.completed', 'axflow.completed', 'axflow.failed', 'dispatcher.delegate', 'dispatcher.turn', 'dispatcher.completed', 'dispatcher.failed'].includes(event.type)) {
        api<RunResponse>(`/runs/${runId}`).then((data) => {
          setRun(data.run);
          setChildren(data.children ?? []);
        }).catch(() => undefined);
      }
    };
    return () => source.close();
  }, [runId]);

  const status = run?.status ?? 'loading';
  const toolCalls = useMemo(() => deriveToolCalls(events), [events]);
  const approvals = useMemo(() => deriveApprovals(events), [events]);
  const actorTurns = useMemo(() => deriveActorTurns(events), [events]);
  const chatLog = latestPayload(events, 'ax.chat_log.captured')?.chatLog;
  const usage = latestPayload(events, 'ax.usage.captured');
  const traces = latestPayload(events, 'ax.traces.captured')?.traces;
  const resolvedModel = latestPayload(events, 'ax.model.resolved') as {
    model?: string;
    provider?: string;
    source?: string;
    temperature?: number;
    mode?: string;
  } | null;

  const output = run?.outputJson ?? latestPayload(events, 'run.completed')?.output;
  const inputRequest =
    run?.inputJson && typeof run.inputJson === 'object' && run.inputJson !== null
      ? String((run.inputJson as { taskText?: unknown; request?: unknown }).taskText
          ?? (run.inputJson as { request?: unknown }).request
          ?? '')
      : null;

  const statusMessages = events.filter((e) => e.type === 'run.status');
  const graphEvents = events.filter((e) => e.type.startsWith('graph.'));
  const showGraphCanvas = isGraphParentRun(run);
  const showAxFlowCanvas = isAxFlowRun(run?.inputJson) || run?.runKind === 'axflow';
  const showDispatcherCanvas = isAxDispatcherRun(run?.inputJson) || run?.runKind === 'axdispatcher';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Run detail</h1>
          <p className="font-mono text-sm text-muted-foreground">{runId}</p>
          {run?.agentId ? <p className="mt-1 text-sm text-muted-foreground">agent: {run.agentId}</p> : null}
          {run?.runKind === 'graph' ? <p className="mt-1 text-sm text-sky-400">graph workflow run</p> : null}
          {run?.runKind === 'axflow' ? <p className="mt-1 text-sm text-violet-400">ax-llm flow() run (governed)</p> : null}
          {run?.runKind === 'axdispatcher' ? <p className="mt-1 text-sm text-amber-400">ax-server dispatcher run (governed)</p> : null}
          {run?.stepKey ? <p className="mt-1 text-sm text-muted-foreground">step: {run.stepKey}</p> : null}
          {resolvedModel?.model ? (
            <p className="mt-1 text-sm text-muted-foreground">
              model: <span className="text-foreground">{resolvedModel.model}</span>
              {resolvedModel.provider ? ` · ${resolvedModel.provider}` : null}
              {resolvedModel.source ? ` · ${resolvedModel.source}` : null}
              {resolvedModel.temperature !== undefined ? ` · temp ${resolvedModel.temperature}` : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusTone(status)}`}>{status}</span>
          {status === 'needs_approval' ? (
            <Link
              href="/operations/approvals"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Review approvals
            </Link>
          ) : null}
        </div>
      </div>

      <Section title="Final output" subtitle="What the run produced when it finished.">
        {run?.error ? <p className="text-red-300">{run.error}</p> : null}
        {output && typeof output === 'object' && output !== null && 'answer' in output ? (
          <div className="space-y-3">
            <p className="text-base leading-relaxed text-foreground">{String((output as { answer: unknown }).answer)}</p>
            {'nextActions' in output && Array.isArray((output as { nextActions: unknown }).nextActions) ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Suggested next actions</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                  {((output as { nextActions: string[] }).nextActions).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : output ? (
          <JsonBlock value={output} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {status === 'running' || status === 'queued' ? 'Run still in progress…' : 'No final output yet.'}
          </p>
        )}
      </Section>

      {showAxFlowCanvas && run ? <AxFlowRunCanvasPanel run={run} events={events} /> : null}
      {showDispatcherCanvas && run ? <DispatcherRunCanvasPanel run={run} events={events} /> : null}

      {showGraphCanvas && run ? (
        <GraphRunCanvasPanel run={run} events={events} children={children} />
      ) : null}

      {(children.length > 0 || graphEvents.length > 0) ? (
        <Section title="Graph steps" subtitle={`${children.length} child run(s)`}>
          {graphEvents.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {graphEvents.map((event) => (
                <li key={event.id} className="text-sm text-foreground">
                  <span className="font-mono text-xs text-muted-foreground">#{event.seq}</span>{' '}
                  {event.type}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="space-y-2">
            {children.map((child) => (
              <li key={child.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{child.stepKey ?? 'step'}</span>
                  <span className="text-muted-foreground">{child.agentId}</span>
                  <span className={statusTone(child.status)}>{child.status}</span>
                  <Link href={`/runs/${child.id}`} className="text-sky-400 hover:underline">Open child run</Link>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Status" subtitle="Run lifecycle and pause points.">
        {inputRequest ? (
          <div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Input request</p>
            <p className="mt-1 text-sm text-foreground">{inputRequest}</p>
          </div>
        ) : null}
        {statusMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status transitions recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.filter((e) => e.type === 'run.resumed').map((event) => (
              <li key={event.id} className="flex items-start gap-3 text-sm text-emerald-300">
                <span className="font-mono text-xs text-muted-foreground">#{event.seq}</span>
                <span>Resumed after approval (no full rerun)</span>
              </li>
            ))}
            {statusMessages.map((event) => {
              const p = (event.payloadJson ?? {}) as Record<string, unknown>;
              return (
                <li key={event.id} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">#{event.seq}</span>
                  <div>
                    <span className="font-medium text-foreground">{String(p.status ?? p.message ?? 'status update')}</span>
                    {p.approvalId ? <p className="text-xs text-muted-foreground">approval: {String(p.approvalId)}</p> : null}
                    {p.message && p.status ? <p className="text-muted-foreground">{String(p.message)}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Tool calls" subtitle={`${toolCalls.length} tool invocation(s)`}>
        {toolCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tool calls yet.</p>
        ) : (
          <div className="space-y-3">
            {toolCalls.map((tool) => (
              <div key={tool.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-foreground">{tool.name}</span>
                  <span className={`text-xs font-medium uppercase ${toolStatusTone(tool.status)}`}>{tool.status}</span>
                </div>
                {tool.args !== undefined ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Args</p>
                    <JsonBlock value={tool.args} />
                  </div>
                ) : null}
                {tool.result !== undefined ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Result</p>
                    <JsonBlock value={tool.result} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Approval gates" subtitle={`${approvals.length} approval event(s)`}>
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approval gates triggered.</p>
        ) : (
          <ul className="space-y-3">
            {approvals.map((row, i) => (
              <li key={`${row.seq}-${i}`} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm">{row.toolName}</span>
                  <span className={`text-xs font-medium uppercase ${approvalStatusTone(row.status)}`}>{row.status}</span>
                </div>
                {row.reason ? <p className="mt-2 text-sm text-foreground">{row.reason}</p> : null}
                {row.id ? <p className="mt-1 font-mono text-xs text-muted-foreground">{row.id}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Actor turns" subtitle={`${actorTurns.length} Ax actor step(s)`}>
        {actorTurns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actor turns yet.</p>
        ) : (
          <div className="space-y-3">
            {actorTurns.map((turn) => (
              <div key={turn.seq} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">#{turn.seq}</span>
                  {turn.stage ? <span className="rounded-full border border-violet-700 px-2 py-0.5 text-xs text-violet-200">{turn.stage}</span> : null}
                  {turn.turn !== undefined ? <span className="text-muted-foreground">turn {turn.turn}</span> : null}
                </div>
                {turn.javascriptCode ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs text-violet-100">{turn.javascriptCode}</pre>
                ) : null}
                {turn.result !== undefined ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Result</p>
                    <JsonBlock value={turn.result} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Usage" subtitle="Token and staged usage captured from Ax." defaultOpen={false}>
        {usage ? <JsonBlock value={usage} /> : <p className="text-sm text-muted-foreground">No usage captured yet.</p>}
      </Section>

      <Section title="Chat log" subtitle="Messages captured from the agent session." defaultOpen={false}>
        {chatLog ? (
          <div className="space-y-2">
            {Array.isArray(chatLog) ? (
              chatLog.map((entry, i) => {
                const row = entry as { role?: string; content?: string };
                return (
                  <div key={i} className="rounded-md border border-border p-3">
                    <p className="text-xs uppercase text-muted-foreground">{row.role ?? 'message'}</p>
                    <p className="mt-1 text-sm text-foreground">{row.content}</p>
                  </div>
                );
              })
            ) : (
              <JsonBlock value={chatLog} />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No chat log yet.</p>
        )}
      </Section>

      <Section title="Traces" subtitle="Observability traces from the run." defaultOpen={false}>
        {traces ? <JsonBlock value={traces} /> : <p className="text-sm text-muted-foreground">No traces yet.</p>}
      </Section>

      <Section title="Raw event log" subtitle={`${events.length} durable event(s) — full timeline`} defaultOpen={false}>
        <div className="space-y-2">
          {events.map((event) => (
            <details key={event.id} className="rounded-lg border border-border bg-muted/30 p-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-mono text-xs text-muted-foreground">#{event.seq}</span>{' '}
                <span className="text-foreground">{event.type}</span>{' '}
                <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString()}</span>
              </summary>
              <JsonBlock value={event.payloadJson} />
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
