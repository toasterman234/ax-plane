'use client';

import type { ComparisonMetric, LabEvalComparison } from '@axplane/eval/lab-comparison';
import { barWidths, comparisonMetrics, deltaTone } from '@axplane/eval/lab-comparison';
import { cn } from '@/lib/utils';

function deltaClass(tone: 'good' | 'bad' | 'neutral'): string {
  if (tone === 'good') return 'text-emerald-400';
  if (tone === 'bad') return 'text-red-400';
  return 'text-muted-foreground';
}

type MetricComparisonChartProps = {
  comparison: LabEvalComparison;
};

function MetricRow({ metric }: { metric: ComparisonMetric }) {
  const widths = barWidths(metric.baseline, metric.candidate, metric.higherIsBetter);
  const tone = deltaTone(metric.delta, metric.higherIsBetter);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{metric.label}</span>
        <span className={cn('font-mono', deltaClass(tone))}>
          {metric.delta >= 0 && tone !== 'bad' ? '+' : ''}
          {metric.key === 'costUsd'
            ? `$${metric.delta.toFixed(4)}`
            : metric.key === 'avgTurns'
              ? metric.delta.toFixed(1)
              : metric.key === 'toolMistakes'
                ? Math.round(metric.delta)
                : `${Math.round(metric.delta)}%`}
        </span>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="w-16 shrink-0">Baseline</span>
          <div className="h-2 flex-1 rounded bg-secondary/40">
            <div
              className="h-2 rounded bg-slate-400/80"
              style={{ width: `${Math.max(widths.baselineWidth, 4)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-foreground">{metric.format(metric.baseline)}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="w-16 shrink-0 text-emerald-300/90">Candidate</span>
          <div className="h-2 flex-1 rounded bg-secondary/40">
            <div
              className="h-2 rounded bg-emerald-500/80"
              style={{ width: `${Math.max(widths.candidateWidth, 4)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-foreground">{metric.format(metric.candidate)}</span>
        </div>
      </div>
    </div>
  );
}

export function MetricComparisonChart({ comparison }: MetricComparisonChartProps) {
  const metrics = comparisonMetrics(comparison);

  return (
    <div className="space-y-4" role="img" aria-label="Baseline versus candidate metrics">
      {metrics.map((metric) => (
        <MetricRow key={metric.key} metric={metric} />
      ))}
    </div>
  );
}
