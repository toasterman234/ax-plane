'use client';

import type { EvalMatrix } from '@/lib/eval-types';
import { cellKey } from '@/lib/eval-types';
import { cn } from '@/lib/utils';

function cellClass(status: string, score: number): string {
  if (status === 'passed' || score >= 100) return 'bg-emerald-900/50 text-emerald-200 ring-emerald-800/60';
  if (status === 'error') return 'bg-red-950/70 text-red-200 ring-red-900/60';
  if (score >= 70) return 'bg-amber-950/50 text-amber-200 ring-amber-900/50';
  return 'bg-red-950/50 text-red-200 ring-red-900/50';
}

type CaseHeatmapProps = {
  matrix: EvalMatrix;
  selectedRunId?: string | null;
  selectedCaseId?: string | null;
  onSelectRun?: (runId: string) => void;
  onSelectCell?: (caseId: string, runId: string) => void;
};

export function CaseHeatmap({ matrix, selectedRunId, selectedCaseId, onSelectRun, onSelectCell }: CaseHeatmapProps) {
  const cellMap = new Map(matrix.cells.map((cell) => [cellKey(cell.caseId, cell.runId), cell]));

  if (matrix.runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No finished runs yet — run eval to populate the heatmap.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card py-2 pr-3 font-medium">Case</th>
            {matrix.runs.map((run) => (
              <th key={run.id} className="min-w-[72px] px-1 py-2 text-center font-normal">
                <button
                  type="button"
                  className={cn(
                    'mx-auto block max-w-[88px] truncate rounded px-1 py-0.5 hover:bg-secondary/60',
                    selectedRunId === run.id && 'bg-sky-950/40 text-sky-300',
                  )}
                  title={run.label}
                  onClick={() => onSelectRun?.(run.id)}
                >
                  {run.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.cases.map((evalCase) => (
            <tr key={evalCase.id} className="border-b border-border/50">
              <td className="sticky left-0 z-10 bg-card py-2 pr-3 font-medium text-foreground">{evalCase.name}</td>
              {matrix.runs.map((run) => {
                const cell = cellMap.get(cellKey(evalCase.id, run.id));
                if (!cell) {
                  return (
                    <td key={run.id} className="px-1 py-2 text-center text-muted-foreground">
                      —
                    </td>
                  );
                }
                return (
                  <td key={run.id} className="px-1 py-2 text-center">
                    <button
                      type="button"
                      title={`${cell.status} · ${cell.score}%`}
                      className={cn(
                        'inline-flex min-w-[2.5rem] items-center justify-center rounded px-1.5 py-1 font-mono ring-1',
                        cellClass(cell.status, cell.score),
                        selectedRunId === run.id && selectedCaseId === evalCase.id && 'ring-2 ring-sky-500',
                        selectedRunId === run.id && !selectedCaseId && 'ring-2 ring-sky-500/60',
                      )}
                      onClick={() => {
                        onSelectRun?.(run.id);
                        onSelectCell?.(evalCase.id, run.id);
                      }}
                    >
                      {cell.score}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
