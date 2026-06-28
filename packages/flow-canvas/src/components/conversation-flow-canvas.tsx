'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import type { FlowTraceEvent } from '@axplane/flow-trace-bus';
import { useFlowTrace } from '../use-flow-trace';

/**
 * Observatory Slice B (B1) — LIVE conversation-flow canvas.
 *
 * Ported from `~/ax/studio/components/canvas/conversation-flow-canvas.tsx` and
 * adapted to consume the Slice-A `FlowTraceEvent[]` contract (via `useFlowTrace`)
 * instead of ax-studio's own `/api/flowtrace` event vocabulary. It keeps the
 * differentiating Studio UX:
 *
 *   • router-tier nodes  — greeting / classify / direct / personal-fact /
 *     full-dispatcher / OB1 memory / dispatcher-loop / specialist boxes.
 *   • dimmed-branch edges — a message travels exactly ONE branch through the
 *     fixed front-door tree; that branch lights green, the paths it skipped dim.
 *   • per-turn stacking   — each dispatcher actor-turn (`turn_complete`) stacks
 *     as an expandable row inside the loop node, plus a turn-timeline strip.
 *
 * Data source: one AxPlane run (`runId`). `FlowTraceEvent`s for that run are
 * folded into a single `Turn` shape the existing map/edge code already knows how
 * to paint. Studio's fs-backed history/replay picker is intentionally dropped —
 * eval replay is Slice C and rides the same bus through `replayTrace`.
 */

// ── shapes (adapted from the Studio canvas) ──────────────────────────────────
type Tier = 'trivial' | 'personal_fact' | 'simple_direct' | 'complex_agentic';

const TIER_LABEL: Record<Tier, string> = {
  trivial: 'Tier 1 · greeting (instant)',
  personal_fact: 'Tier 2 · personal fact',
  simple_direct: 'Tier 2 · direct answer',
  complex_agentic: 'Tier 2 · full dispatcher',
};

// One actor turn inside the dispatcher loop — the real per-step trace.
type TurnDetail = {
  turn?: number;
  stage?: string;
  latencySec?: number;
  output?: string;
  thought?: string;
  isError?: boolean;
};

type ToolCall = { name: string; args?: unknown; isDelegate?: boolean };
type Ob1Item = { preview: string; kind: 'recent' | 'vector' };

type Turn = {
  message: string;
  route?: Tier;
  rawRoute?: string;
  tools: ToolCall[];
  details: TurnDetail[];
  agentTurns: number;
  answer: string;
  done: boolean;
  error?: boolean;
  routeMechanism?: string;
  routeRationale?: string;
  hasOb1: boolean;
  ob1Items: Ob1Item[];
};

// ── one box ──────────────────────────────────────────────────────────────────
type Variant = 'intake' | 'route' | 'gen' | 'tool' | 'output';
type ConvNodeData = {
  title: string;
  subtitle?: string;
  variant: Variant;
  running?: boolean;
  error?: boolean;
  ghost?: boolean;
  badge?: string;
  dimmed?: boolean; // an off-path branch this message did NOT take
  details?: TurnDetail[];
  totalLatencySec?: number;
  expanded?: Set<string>;
  expandKey?: string;
  onToggle?: (rowKey: string) => void;
  toolArgs?: unknown;
  ob1Items?: Ob1Item[];
};

const VARIANT_STYLES: Record<Variant, string> = {
  intake: 'border-emerald-500/60 bg-emerald-500/10',
  route: 'border-fuchsia-500/60 bg-fuchsia-500/10',
  gen: 'border-border bg-card',
  tool: 'border-violet-500/60 bg-violet-500/10',
  output: 'border-sky-500/60 bg-sky-500/10',
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const fmtSec = (s?: number) => (typeof s === 'number' ? `${s.toFixed(1)}s` : '');

function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// One expandable actor-turn row inside the dispatcher-loop node.
function TurnRow({
  d,
  rowKey,
  open,
  onToggle,
}: {
  d: TurnDetail;
  rowKey: string;
  open: boolean;
  onToggle?: (k: string) => void;
}) {
  const label = `turn ${d.turn ?? '?'} · ${d.stage ?? 'actor'}`;
  return (
    <div className={`rounded border ${d.isError ? 'border-red-400/50' : 'border-border/60'}`}>
      <button
        type="button"
        className="nodrag flex w-full items-center justify-between gap-2 px-1.5 py-1 text-left hover:bg-muted/50"
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.(rowKey);
        }}
      >
        <span className="truncate font-mono text-[11px]">
          {open ? '▾' : '▸'} {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmtSec(d.latencySec)}</span>
      </button>
      {open ? (
        <div className="space-y-1 border-t border-border/60 px-1.5 py-1">
          {d.thought?.trim() ? (
            <div className="whitespace-pre-wrap break-words text-[11px] italic text-muted-foreground">
              💭 {clip(d.thought.trim(), 400)}
            </div>
          ) : null}
          {d.output && d.output.trim() && d.output.trim() !== 'undefined' ? (
            <div className="whitespace-pre-wrap break-words font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
              → {clip(d.output.trim(), 220)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ConvNode({ data }: NodeProps & { data: ConvNodeData }) {
  const ring = data.error
    ? 'border-red-500 ring-1 ring-red-500/40'
    : data.ghost
      ? 'border-dashed border-sky-400/50 opacity-50'
      : data.running
        ? 'border-amber-500 ring-1 ring-amber-500/40 animate-pulse'
        : '';
  const hasDetails = (data.details?.length ?? 0) > 0;
  return (
    <div
      className={`${hasDetails ? 'min-w-72 max-w-80' : 'min-w-44 max-w-72'} rounded-lg border px-3 py-2 shadow-sm transition-opacity ${VARIANT_STYLES[data.variant]} ${ring} ${data.dimmed ? 'opacity-25' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{data.title}</span>
        {data.badge ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {data.badge}
          </span>
        ) : typeof data.totalLatencySec === 'number' ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {fmtSec(data.totalLatencySec)}
          </span>
        ) : null}
      </div>
      {data.subtitle ? (
        <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{data.subtitle}</div>
      ) : null}
      {hasDetails ? (
        <div className="nowheel mt-1.5 max-h-72 space-y-1 overflow-auto">
          {data.details!.map((d, i) => {
            const rowKey = `${data.expandKey ?? 't'}:${i}`;
            return (
              <TurnRow key={rowKey} d={d} rowKey={rowKey} open={data.expanded?.has(rowKey) ?? false} onToggle={data.onToggle} />
            );
          })}
        </div>
      ) : null}
      {data.toolArgs != null && asText(data.toolArgs).trim() ? (
        <pre className="nowheel mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-1 text-[10px] leading-snug">
          {clip(asText(data.toolArgs), 400)}
        </pre>
      ) : null}
      {data.ob1Items?.length ? (
        <div className="nowheel mt-1.5 max-h-44 space-y-1 overflow-auto">
          {data.ob1Items.map((m, i) => (
            <div key={i} className="flex items-start gap-1 rounded border border-border/60 px-1.5 py-1">
              <span
                className={`mt-0.5 shrink-0 rounded px-1 text-[9px] uppercase ${
                  m.kind === 'vector'
                    ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {m.kind === 'vector' ? 'sem' : 'recent'}
              </span>
              <span className="break-words text-[10px] leading-snug text-muted-foreground">{clip(m.preview, 120)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { convNode: ConvNode };

// ── the path-router MAP ──────────────────────────────────────────────────────
// ONE fixed decision tree (the real front door). A message always travels exactly
// ONE branch through it; we light that branch + the boxes it touched, and dim the
// branches this message didn't take. Top-down (intake at top, outcomes at bottom).
type MapNode = { key: string; title: string; variant: Variant; x: number; y: number };

const MAP_NODES: MapNode[] = [
  { key: 'message', title: 'Your message', variant: 'intake', x: 460, y: 0 },
  { key: 'greeting', title: 'Tier 1 · greeting?', variant: 'route', x: 460, y: 120 },
  { key: 'fast', title: 'Fast reply', variant: 'output', x: 40, y: 250 },
  { key: 'classify', title: 'Tier 2 · classify intent', variant: 'route', x: 660, y: 250 },
  { key: 'fact', title: 'Personal fact → saved', variant: 'output', x: 300, y: 390 },
  { key: 'direct', title: 'Direct answer', variant: 'output', x: 660, y: 390 },
  { key: 'complex', title: 'Full dispatcher', variant: 'gen', x: 1020, y: 390 },
  { key: 'ob1', title: 'OB1 memory', variant: 'gen', x: 1020, y: 510 },
  { key: 'loop', title: 'Dispatcher loop', variant: 'gen', x: 1020, y: 630 },
  { key: 'answer', title: 'Answer', variant: 'output', x: 1020, y: 790 },
];

const MAP_EDGES: { from: string; to: string; label?: string }[] = [
  { from: 'message', to: 'greeting' },
  { from: 'greeting', to: 'fast', label: 'yes' },
  { from: 'greeting', to: 'classify', label: 'no' },
  { from: 'classify', to: 'fact' },
  { from: 'classify', to: 'direct' },
  { from: 'classify', to: 'complex' },
  { from: 'complex', to: 'ob1' },
  { from: 'ob1', to: 'loop' },
  { from: 'complex', to: 'loop' }, // when no OB1 recall this turn
  { from: 'loop', to: 'answer' },
];

const TOOL_X = 1440; // specialist/flow boxes hang to the right of the loop column

/**
 * Which boxes + edges this message actually lit, plus per-box live subtitles and
 * the current "frontier" box (the one still working). Everything else dims.
 */
function tracePath(t: Turn | null): {
  active: Set<string>;
  activeEdges: Set<string>;
  frontier: string | null;
  sub: Record<string, string | undefined>;
} {
  const active = new Set<string>(['message']);
  const activeEdges = new Set<string>();
  const sub: Record<string, string | undefined> = {};
  const link = (from: string, to: string) => activeEdges.add(`${from}->${to}`);
  if (!t) return { active, activeEdges, frontier: null, sub };

  sub.message = clip(t.message || '…', 120);
  const live = !t.done;
  active.add('greeting');
  link('message', 'greeting');

  let frontier: string | null = t.route ? null : 'greeting';

  if (t.route === 'trivial') {
    active.add('fast');
    link('greeting', 'fast');
    sub.fast = t.answer ? clip(t.answer, 140) : '…';
    if (live) frontier = 'fast';
  } else if (t.route) {
    active.add('classify');
    link('greeting', 'classify');
    sub.classify = TIER_LABEL[t.route];
    if (t.route === 'personal_fact') {
      active.add('fact');
      link('classify', 'fact');
      sub.fact = '“Got it — noted.”';
      if (live) frontier = 'fact';
    } else if (t.route === 'simple_direct') {
      active.add('direct');
      link('classify', 'direct');
      sub.direct = t.answer ? clip(t.answer, 140) : '…';
      if (live) frontier = 'direct';
    } else {
      // complex_agentic
      active.add('complex');
      active.add('loop');
      link('classify', 'complex');
      if (t.hasOb1) {
        active.add('ob1');
        link('complex', 'ob1');
        link('ob1', 'loop');
        sub.ob1 = t.ob1Items[0]?.preview ? clip(t.ob1Items[0].preview, 70) : 'recalled';
      } else {
        link('complex', 'loop');
      }
      sub.loop = t.agentTurns ? `${t.agentTurns} turn${t.agentTurns === 1 ? '' : 's'}` : 'running…';
      if (t.answer || t.done) {
        active.add('answer');
        link('loop', 'answer');
        sub.answer = t.answer ? clip(t.answer, 160) : t.error ? 'errored' : '';
      }
      if (live) frontier = t.answer ? 'answer' : 'loop';
      // specialist / underlying-flow boxes the loop fired (dynamic)
      t.tools.forEach((_, i) => {
        active.add(`tool:${i}`);
        activeEdges.add(`loop->tool:${i}`);
      });
    }
  } else {
    sub.classify = 'classifying…';
  }
  if (!t.done) sub.greeting = t.route ? undefined : 'deciding…';
  return { active, activeEdges, frontier, sub };
}

function normDelegate(name: string): string {
  return name.trim().toLowerCase();
}

function matchesDelegate(actual: string, expected: string): boolean {
  const a = normDelegate(actual);
  const e = normDelegate(expected);
  return a === e || a.endsWith(`.${e.split('.').pop()}`);
}

/** Slice C — eval replay metadata for ghost expected paths + pass/fail styling. */
export type FlowTraceReplayContext = {
  caseId: string;
  prompt: string;
  expectFirst?: string | null;
  expectAny?: string[];
  status: 'running' | 'passed' | 'failed' | 'error' | 'idle';
  failureReason?: string | null;
};

function expectedDelegateNames(replay: FlowTraceReplayContext): string[] {
  const names: string[] = [];
  if (replay.expectFirst) names.push(replay.expectFirst);
  for (const e of replay.expectAny ?? []) {
    if (!names.some((n) => matchesDelegate(n, e))) names.push(e);
  }
  return names;
}

function delegateMatchesReplay(name: string, replay: FlowTraceReplayContext): boolean {
  if (replay.expectFirst && matchesDelegate(name, replay.expectFirst)) return true;
  if (replay.expectAny?.some((e) => matchesDelegate(name, e))) return true;
  if (replay.expectFirst === null && !(replay.expectAny?.length)) return true;
  return false;
}

function buildGraph(
  turn: Turn | null,
  expanded: Set<string>,
  onToggle: (rowKey: string) => void,
  replay?: FlowTraceReplayContext | null,
): { nodes: Node[]; edges: Edge[] } {
  const { active, activeEdges, frontier, sub } = tracePath(turn);
  if (replay?.prompt && !sub.message) sub.message = clip(replay.prompt, 120);
  const loopTotal = (turn?.details ?? []).reduce((a, d) => a + (d.latencySec ?? 0), 0);
  const nodes: Node[] = MAP_NODES.map((n) => ({
    id: n.key,
    type: 'convNode',
    position: { x: n.x, y: n.y },
    data: {
      title: n.title,
      subtitle:
        n.key === 'classify' && turn?.routeRationale
          ? `${sub.classify ?? ''}\n${turn.routeMechanism ?? 'router'}: ${turn.routeRationale}`.trim()
          : sub[n.key],
      variant: n.variant,
      dimmed: !active.has(n.key),
      running: frontier === n.key,
      error: n.key === 'answer' ? turn?.error : false,
      ob1Items: n.key === 'ob1' ? turn?.ob1Items : undefined,
      ...(n.key === 'loop' && turn?.details?.length
        ? {
            details: turn.details,
            totalLatencySec: loopTotal || undefined,
            expanded,
            expandKey: 'loop',
            onToggle,
          }
        : {}),
    } satisfies ConvNodeData,
  }));
  const edges: Edge[] = MAP_EDGES.map((e) => {
    const on = activeEdges.has(`${e.from}->${e.to}`);
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: on && !turn?.done,
      style: { stroke: on ? '#10b981' : '#cbd5e1', strokeWidth: on ? 2 : 1, opacity: on ? 1 : 0.4 },
      labelStyle: { fontSize: 10, opacity: 0.7 },
    };
  });
  // dynamic specialist/flow boxes off the loop
  const loopNode = MAP_NODES.find((n) => n.key === 'loop')!;
  (turn?.tools ?? []).forEach((tc, i) => {
    const id = `tool:${i}`;
    const failedReplay =
      replay &&
      (replay.status === 'failed' || replay.status === 'error') &&
      !delegateMatchesReplay(tc.name, replay);
    nodes.push({
      id,
      type: 'convNode',
      position: { x: TOOL_X, y: loopNode.y + i * 120 },
      data: {
        title: tc.name,
        variant: 'tool',
        badge: tc.isDelegate ? 'delegate' : 'tool',
        dimmed: false,
        error: Boolean(failedReplay),
        toolArgs: tc.args,
      } satisfies ConvNodeData,
    });
    edges.push({
      id: `loop->${id}`,
      source: 'loop',
      target: id,
      animated: !turn?.done && replay?.status === 'running',
      style: {
        stroke: failedReplay ? '#f59e0b' : '#8b5cf6',
        strokeWidth: 2,
      },
    });
  });

  // Ghost expected delegates (Slice C) — dashed boxes for paths the case expects.
  if (replay) {
    const actual = new Set((turn?.tools ?? []).map((t) => t.name));
    const ghosts = expectedDelegateNames(replay).filter((name) => ! [...actual].some((a) => matchesDelegate(a, name)));
    ghosts.forEach((name, gi) => {
      const id = `ghost:${gi}`;
      nodes.push({
        id,
        type: 'convNode',
        position: { x: TOOL_X + 200, y: loopNode.y + gi * 120 },
        data: {
          title: name,
          subtitle: 'expected',
          variant: 'tool',
          badge: 'ghost',
          ghost: true,
          dimmed: true,
        } satisfies ConvNodeData,
      });
      edges.push({
        id: `loop->${id}`,
        source: 'loop',
        target: id,
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '6 4', opacity: 0.55 },
      });
    });
  }
  return { nodes, edges };
}

// ── reflow by measured height ────────────────────────────────────────────────
const RANK_GAP = 64;
const DEFAULT_H = 64;
const TOOL_GAP = 28;

function layoutRanks(nodes: Node[], heights: Record<string, number>): Node[] {
  const baseY: Record<string, number> = Object.fromEntries(MAP_NODES.map((n) => [n.key, n.y]));
  const rows = Array.from(new Set(MAP_NODES.map((n) => n.y))).sort((a, b) => a - b);
  const rowTop: Record<number, number> = {};
  let cursor = 0;
  for (const r of rows) {
    rowTop[r] = cursor;
    const tallest = Math.max(
      DEFAULT_H,
      ...MAP_NODES.filter((n) => n.y === r).map((n) => heights[n.key] ?? DEFAULT_H),
    );
    cursor += tallest + RANK_GAP;
  }
  let toolCursor = rowTop[baseY['loop'] ?? 0] ?? 0;
  return nodes.map((node) => {
    if (node.id in baseY) {
      return { ...node, position: { x: node.position.x, y: rowTop[baseY[node.id]] } };
    }
    const y = toolCursor;
    toolCursor += (heights[node.id] ?? 80) + TOOL_GAP;
    return { ...node, position: { x: node.position.x, y } };
  });
}

// Re-fit the viewport when the run changes. Must live inside <ReactFlowProvider>.
function FitOnRun({ graphKey }: { graphKey?: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = setTimeout(
      () => void fitView({ padding: 0.06, duration: 280, maxZoom: 1.15, minZoom: 0.08 }),
      120,
    );
    return () => clearTimeout(id);
  }, [graphKey, fitView]);
  return null;
}

// ── reduce Slice-A FlowTraceEvent[] → one Turn ───────────────────────────────
const KNOWN_TIERS = new Set<Tier>(['trivial', 'personal_fact', 'simple_direct', 'complex_agentic']);

function toTier(route?: string): Tier | undefined {
  if (!route) return undefined;
  const r = route.trim();
  if (KNOWN_TIERS.has(r as Tier)) return r as Tier;
  if (/^(greet|trivial)/i.test(r)) return 'trivial';
  if (/fact/i.test(r)) return 'personal_fact';
  if (/(direct|simple)/i.test(r)) return 'simple_direct';
  // any routed-but-unknown path means real work happened → full dispatcher.
  return 'complex_agentic';
}

const OB1_RE = /ob1|memory|recall/i;

/** A `turn_complete` that closes the conversation (vs. an intermediate actor step). */
function isCompletion(e: Extract<FlowTraceEvent, { kind: 'turn_complete' }>): boolean {
  if (e.stage && /complete|done|final|answer/i.test(e.stage)) return true;
  // dispatcher.completed maps to a turn_complete with no per-turn index.
  return e.turn == null && Boolean(e.output);
}

export function reduceFlowTrace(events: FlowTraceEvent[]): Turn | null {
  if (!events.length) return null;
  const turn: Turn = {
    message: '',
    tools: [],
    details: [],
    agentTurns: 0,
    answer: '',
    done: false,
    hasOb1: false,
    ob1Items: [],
  };
  let pendingThought: string | undefined;

  for (const e of events) {
    switch (e.kind) {
      case 'route':
        turn.rawRoute = e.route;
        turn.route = toTier(e.route);
        turn.routeMechanism = e.mechanism;
        turn.routeRationale = e.rationale;
        break;
      case 'thinking':
        if (e.stage === 'case-prompt' && !turn.message) turn.message = clip(e.text, 160);
        pendingThought = e.text;
        if (e.stage && OB1_RE.test(e.stage)) turn.hasOb1 = true;
        break;
      case 'delegate': {
        if (!turn.route) turn.route = 'complex_agentic';
        if (!turn.tools.some((x) => x.name === e.target))
          turn.tools.push({ name: e.target, args: e.args, isDelegate: true });
        break;
      }
      case 'tool_call': {
        const name = e.qualifiedName ?? e.name;
        if (OB1_RE.test(name)) {
          turn.hasOb1 = true;
          const preview = asText(e.args).trim() || name;
          turn.ob1Items.push({ preview, kind: 'vector' });
        } else if (!turn.tools.some((x) => x.name === name)) {
          turn.tools.push({ name, args: e.args });
        }
        break;
      }
      case 'turn_complete': {
        if (e.turn != null || e.output || e.stage) {
          turn.agentTurns += 1;
          turn.details.push({
            turn: e.turn,
            stage: e.stage,
            latencySec: e.latencySec,
            output: e.output,
            thought: pendingThought,
            isError: e.isError,
          });
          pendingThought = undefined;
        }
        if (e.output) turn.answer = clip(e.output, 240);
        if (e.isError) turn.error = true;
        if (isCompletion(e)) turn.done = true;
        break;
      }
    }
  }
  if (turn.route == null && (turn.tools.length || turn.details.length)) turn.route = 'complex_agentic';
  return turn;
}

// ── timeline strip ────────────────────────────────────────────────────────────
function TimelineStrip({ details }: { details: TurnDetail[] }) {
  const timed = details.filter((d) => (d.latencySec ?? 0) > 0);
  const total = timed.reduce((a, d) => a + (d.latencySec ?? 0), 0);
  if (!timed.length || total <= 0) return null;
  const max = Math.max(...timed.map((d) => d.latencySec ?? 0));
  return (
    <div className="shrink-0 border-b px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Turn timeline</span>
        <span className="font-mono">total {total.toFixed(1)}s</span>
      </div>
      <div className="flex h-6 w-full items-stretch gap-0.5">
        {timed.map((d, i) => {
          const sec = d.latencySec ?? 0;
          const pct = Math.max(5, (sec / total) * 100);
          const isMax = sec === max;
          return (
            <div
              key={i}
              title={`turn ${d.turn ?? i + 1} · ${d.stage ?? 'actor'} · ${sec.toFixed(1)}s`}
              style={{ width: `${pct}%` }}
              className={`flex min-w-0 items-center justify-center overflow-hidden rounded text-[9px] font-mono text-white ${
                isMax ? 'bg-red-500' : 'bg-sky-500/80'
              }`}
            >
              <span className="truncate px-1">{sec >= 1 ? `${sec.toFixed(1)}s` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── the canvas ────────────────────────────────────────────────────────────────
export interface ConversationFlowCanvasProps {
  /**
   * The AxPlane run whose flow-trace to paint. When omitted/null the canvas shows
   * its empty "send a message" hint. (How the active runId is acquired is wired in
   * Slice C — until then the Observatory page seeds it from `?runId=`.)
   */
  runId?: string | null;
  /** API base for the SSE stream — defaults to same-origin. */
  baseUrl?: string;
  /**
   * Pre-fetched events. When provided they win over the internal `useFlowTrace`
   * subscription, so a parent that already holds the run's events (e.g. to also
   * feed a trace panel) can share one connection.
   */
  events?: FlowTraceEvent[];
  /** Eval replay (Slice C) — ghost expected delegates + pass/fail tool styling. */
  replay?: FlowTraceReplayContext | null;
  className?: string;
}

export function ConversationFlowCanvas({ runId, baseUrl, events: eventsProp, replay, className }: ConversationFlowCanvasProps) {
  // Always call the hook (rules of hooks); pass a null runId when the parent
  // already supplied events so we open no second EventSource.
  const hookEvents = useFlowTrace(eventsProp ? null : (runId ?? null), { baseUrl });
  const events = eventsProp ?? hookEvents;

  const turn = useMemo(() => reduceFlowTrace(events), [events]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = useCallback((rowKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }, []);

  const { nodes, edges } = useMemo(
    () => buildGraph(turn, expanded, toggleRow, replay),
    [turn, expanded, toggleRow, replay],
  );

  const [heights, setHeights] = useState<Record<string, number>>({});
  // Reset measured heights whenever the run switches so a fresh run lays out clean.
  useEffect(() => {
    setHeights({});
  }, [runId]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setHeights((prev) => {
      let next = prev;
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) {
          const h = Math.round(c.dimensions.height);
          if (h > 0 && prev[c.id] !== h) next = { ...next, [c.id]: h };
        }
      }
      return next;
    });
  }, []);
  const laidOut = useMemo(() => layoutRanks(nodes, heights), [nodes, heights]);

  if (!turn) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground ${className ?? 'h-full w-full min-h-[320px]'}`}
      >
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
        <div className="font-medium">Live path-router map</div>
        <div className="max-w-xs text-xs">
          Run the dispatcher — this is the front door your message travels through. The branch it
          actually takes lights up; the paths it skips stay greyed out.
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className ?? 'h-full w-full min-h-[320px]'}`}>
      {turn.details.length ? <TimelineStrip details={turn.details} /> : null}
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={laidOut}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.06, maxZoom: 1.15 }}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
            minZoom={0.08}
            maxZoom={1.5}
          >
            <Background gap={16} color="#334155" />
            <Controls showInteractive={false} className="!bg-slate-900 !border-slate-700" />
            <FitOnRun graphKey={`${runId ?? 'idle'}-${laidOut.length}`} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
