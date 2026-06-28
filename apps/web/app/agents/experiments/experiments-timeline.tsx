'use client';

import Link from 'next/link';
import type { ExperimentTimelineItem } from '@/lib/experiments-types';
import { cn } from '@/lib/utils';

function kindClass(kind: ExperimentTimelineItem['kind']): string {
  if (kind === 'eval') return 'text-sky-400';
  if (kind === 'optimization') return 'text-emerald-400';
  return 'text-violet-400';
}

function statusClass(status: string): string {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'running') return 'text-amber-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-muted-foreground';
}

type ExperimentsTimelineProps = {
  items: ExperimentTimelineItem[];
  selectedRunIds: string[];
  onToggleRun: (runId: string, kind: ExperimentTimelineItem['kind']) => void;
};

export function ExperimentsTimeline({ items, selectedRunIds, onToggleRun }: ExperimentsTimelineProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No experiment activity matches these filters.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const selectable = item.kind === 'eval';
        const selected = selectable && selectedRunIds.includes(item.id);
        return (
          <li key={`${item.kind}:${item.id}`} className="rounded-md border border-border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-xs uppercase tracking-wide', kindClass(item.kind))}>{item.kind}</span>
                  <span className={statusClass(item.status)}>{item.status}</span>
                  <span className="text-foreground">{item.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                  {item.agentId ? ` · ${item.agentId}` : ''}
                  {item.summary.averageScore != null ? ` · avg ${item.summary.averageScore}%` : ''}
                  {item.summary.passed != null && item.summary.total != null
                    ? ` · ${item.summary.passed}/${item.summary.total} passed`
                    : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectable ? (
                  <button
                    type="button"
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs',
                      selected ? 'border-sky-700 bg-sky-950/30 text-sky-300' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => onToggleRun(item.id, item.kind)}
                  >
                    {selected ? 'Selected' : 'Compare'}
                  </button>
                ) : null}
                <Link href={item.href} className="text-xs text-sky-400 hover:underline">
                  Open
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
