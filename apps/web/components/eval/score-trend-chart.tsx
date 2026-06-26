'use client';

import type { EvalRun } from '@/lib/eval-types';

type ScoreTrendChartProps = {
  runs: EvalRun[];
  versionById?: Map<string, number>;
  selectedRunId?: string | null;
  onSelectRun?: (runId: string) => void;
};

const CHART_WIDTH = 560;
const CHART_HEIGHT = 160;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

function formatTick(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleString(undefined, { month: 'numeric', day: 'numeric' });
}

export function ScoreTrendChart({ runs, versionById, selectedRunId, onSelectRun }: ScoreTrendChartProps) {
  const points = runs
    .filter((run) => run.status === 'completed' && run.summaryJson != null)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No completed runs to chart yet.</p>;
  }

  const innerW = CHART_WIDTH - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const xStep = points.length === 1 ? 0 : innerW / (points.length - 1);

  const coords = points.map((run, index) => {
    const score = run.summaryJson?.averageScore ?? 0;
    const x = PAD.left + index * xStep;
    const y = PAD.top + innerH - (score / 100) * innerH;
    return { run, score, x, y };
  });

  const polyline = coords.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full max-w-full text-muted-foreground"
        role="img"
        aria-label="Average eval score trend"
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = PAD.top + innerH - (tick / 100) * innerH;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={CHART_WIDTH - PAD.right} y2={y} stroke="currentColor" strokeOpacity={0.12} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-current text-[10px]">
                {tick}
              </text>
            </g>
          );
        })}
        <polyline
          fill="none"
          stroke="rgb(56 189 248)"
          strokeWidth={2}
          strokeLinejoin="round"
          points={polyline}
        />
        {coords.map(({ run, score, x, y }) => {
          const version = run.agentVersionId ? versionById?.get(run.agentVersionId) : undefined;
          const label = version != null ? `v${version}` : formatTick(run.createdAt);
          return (
            <g key={run.id}>
              <circle
                cx={x}
                cy={y}
                r={selectedRunId === run.id ? 6 : 4}
                className="cursor-pointer fill-sky-400 stroke-sky-200"
                strokeWidth={selectedRunId === run.id ? 2 : 1}
                onClick={() => onSelectRun?.(run.id)}
              >
                <title>{`${label} · ${score}% avg`}</title>
              </circle>
              <text x={x} y={CHART_HEIGHT - 6} textAnchor="middle" className="fill-current text-[9px]">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-muted-foreground">
        {points.length} run{points.length === 1 ? '' : 's'} · click a point to open run detail
      </p>
    </div>
  );
}
