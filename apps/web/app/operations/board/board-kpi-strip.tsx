'use client';

import type { BoardColumn } from './board-types';
import { countColumnCards } from './board-types';
import { cn } from '@/lib/utils';

type KpiTile = {
  label: string;
  value: number;
  tone?: string;
};

function buildTiles(columns: BoardColumn[], counts: { total: number; activeRuns: number; pendingApprovals: number }): KpiTile[] {
  return [
    { label: 'Total', value: counts.total },
    { label: 'Ready', value: countColumnCards(columns, 'ready') + countColumnCards(columns, 'inbox'), tone: 'text-sky-400' },
    { label: 'Active', value: counts.activeRuns, tone: 'text-amber-400' },
    { label: 'Approvals', value: counts.pendingApprovals, tone: 'text-orange-400' },
    { label: 'Done', value: countColumnCards(columns, 'done'), tone: 'text-emerald-400' },
    { label: 'Failed', value: countColumnCards(columns, 'failed'), tone: 'text-red-400' },
  ];
}

export function BoardKpiStrip({
  columns,
  counts,
}: {
  columns: BoardColumn[];
  counts: { total: number; activeRuns: number; pendingApprovals: number };
}) {
  const tiles = buildTiles(columns, counts);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 shadow-sm"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
          <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums', tile.tone ?? 'text-foreground')}>
            {tile.value}
          </p>
        </div>
      ))}
    </div>
  );
}
