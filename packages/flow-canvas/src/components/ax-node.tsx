'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '../spec-to-flow';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const fmtTok = (n?: number) => (typeof n === 'number' ? `${n.toLocaleString()} tok` : '');

const VARIANT_STYLES: Record<FlowNodeData['variant'], string> = {
  intake: 'border-emerald-500/60 bg-emerald-950/30',
  gen: 'border-slate-600 bg-slate-900/80',
  output: 'border-sky-500/60 bg-sky-950/30',
  gate: 'border-amber-500/70 bg-amber-950/20 border-dashed',
  branch: 'border-fuchsia-500/60 bg-fuchsia-950/20',
  tool: 'border-violet-500/60 bg-violet-950/20',
  fanout: 'border-pink-500/60 bg-pink-950/20',
};

const VARIANT_LABEL: Record<FlowNodeData['variant'], string> = {
  intake: 'input',
  gen: 'gen',
  output: 'output',
  gate: 'gate',
  branch: 'branch',
  tool: 'tool',
  fanout: 'fan-out',
};

export function AxNode({ data }: NodeProps & { data: FlowNodeData }) {
  const run = data.run;
  const running = run?.status === 'running';
  const errored = run ? run.status === 'error' || run.ok === false : false;
  const runBorder = !run
    ? ''
    : running
      ? 'border-amber-500 ring-1 ring-amber-500/40 animate-pulse'
      : errored
        ? 'border-red-500 ring-1 ring-red-500/40'
        : 'border-emerald-500 ring-1 ring-emerald-500/30';

  const selectedRing = data.selected ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-slate-950' : '';

  return (
    <div
      className={`${data.expanded ? 'min-w-64 max-w-80' : 'min-w-44 max-w-64'} cursor-pointer rounded-lg border px-3 py-2 shadow-sm text-slate-100 ${VARIANT_STYLES[data.variant]} ${runBorder} ${selectedRing}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{data.title}</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
          {VARIANT_LABEL[data.variant]}
        </span>
      </div>
      {data.subtitle ? (
        <div className="mt-1 break-words font-mono text-xs text-slate-400">{data.subtitle}</div>
      ) : null}
      {run ? (
        <div className="mt-2 border-t border-slate-700 pt-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                running ? 'animate-pulse bg-amber-500' : errored ? 'bg-red-500' : 'bg-emerald-500'
              }`}
            />
            <span className="text-slate-400">
              {running ? 'running…' : errored ? 'error' : 'ok'}
              {run.latencySec != null ? ` · ${run.latencySec.toFixed(1)}s` : ''}
              {run.totalTokens != null ? ` · ${run.totalTokens.toLocaleString()} tok` : ''}
            </span>
          </div>
          {run.output ? (
            <div className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[10px] leading-snug text-slate-500">
              {run.output}
            </div>
          ) : running ? (
            <div className="mt-1 text-[10px] italic text-slate-600">working…</div>
          ) : null}
        </div>
      ) : null}
      {data.detail ? (
        <div className="mt-1.5 border-t border-slate-700 pt-1.5">
          <button
            type="button"
            className="nodrag flex w-full items-center gap-1 text-left font-mono text-[10px] text-slate-400 hover:text-slate-200"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggle?.(data.id ?? '');
            }}
          >
            <span>{data.expanded ? '▾' : '▸'}</span>
            <span className="truncate">
              {data.detail.model ?? 'detail'}
              {data.detail.totalTokens != null ? ` · ${fmtTok(data.detail.totalTokens)}` : ''}
            </span>
          </button>
          {data.expanded ? (
            <div className="nowheel mt-1 space-y-1">
              {data.detail.promptPreview?.trim() ? (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950/80 p-1 text-[10px] leading-snug text-slate-400">
                  {clip(data.detail.promptPreview.trim(), 600)}
                </pre>
              ) : null}
              {data.detail.output?.trim() ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950/80 p-1 text-[10px] leading-snug text-slate-400">
                  {clip(data.detail.output.trim(), 800)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500" />
    </div>
  );
}
