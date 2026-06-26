'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { CaseComparisonRow } from '@axplane/eval/lab-comparison';
import { cn } from '@/lib/utils';

type SortKey = 'scoreDelta' | 'caseName' | 'baselineScore' | 'candidateScore';

type PerCaseDeltaTableProps = {
  rows: CaseComparisonRow[];
  baselineRunsByCaseId?: Map<string, string | null>;
  candidateRunsByCaseId?: Map<string, string | null>;
};

function statusClass(status: string): string {
  if (status === 'passed') return 'text-emerald-400';
  if (status === 'missing') return 'text-muted-foreground';
  return 'text-red-400';
}

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn('hover:text-foreground', active ? 'text-foreground' : 'text-muted-foreground')}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function PerCaseDeltaTable({
  rows,
  baselineRunsByCaseId,
  candidateRunsByCaseId,
}: PerCaseDeltaTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('scoreDelta');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === 'string' && typeof right === 'string') {
        return sortAsc ? left.localeCompare(right) : right.localeCompare(left);
      }
      const numericLeft = Number(left);
      const numericRight = Number(right);
      return sortAsc ? numericLeft - numericRight : numericRight - numericLeft;
    });
    return copy;
  }, [rows, sortAsc, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((value) => !value);
      return;
    }
    setSortKey(key);
    setSortAsc(key === 'caseName');
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No case-level results to compare yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3">
              <SortButton label="Case" active={sortKey === 'caseName'} onClick={() => toggleSort('caseName')} />
            </th>
            <th className="py-2 pr-3">
              <SortButton label="Baseline" active={sortKey === 'baselineScore'} onClick={() => toggleSort('baselineScore')} />
            </th>
            <th className="py-2 pr-3">
              <SortButton label="Candidate" active={sortKey === 'candidateScore'} onClick={() => toggleSort('candidateScore')} />
            </th>
            <th className="py-2 pr-3">
              <SortButton label="Delta" active={sortKey === 'scoreDelta'} onClick={() => toggleSort('scoreDelta')} />
            </th>
            <th className="py-2">Runs</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row.caseId}
              className={cn(
                'border-b border-border/50 align-top',
                row.regression && 'bg-red-950/20',
                row.improved && !row.regression && 'bg-emerald-950/10',
              )}
            >
              <td className="py-2 pr-3">
                <div className="font-medium text-foreground">{row.caseName}</div>
                {row.regression ? (
                  <div className="text-xs text-red-400">Regression</div>
                ) : row.improved ? (
                  <div className="text-xs text-emerald-400">Improved</div>
                ) : null}
              </td>
              <td className="py-2 pr-3">
                <span className={statusClass(row.baselineStatus)}>{row.baselineStatus}</span>
                <span className="ml-2 font-mono text-foreground">{row.baselineScore}%</span>
              </td>
              <td className="py-2 pr-3">
                <span className={statusClass(row.candidateStatus)}>{row.candidateStatus}</span>
                <span className="ml-2 font-mono text-foreground">{row.candidateScore}%</span>
              </td>
              <td className={cn('py-2 pr-3 font-mono', row.scoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {row.scoreDelta >= 0 ? '+' : ''}{row.scoreDelta}%
              </td>
              <td className="py-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  {baselineRunsByCaseId?.get(row.caseId) ? (
                    <Link href={`/runs/${baselineRunsByCaseId.get(row.caseId)}`} className="text-sky-400 hover:underline">
                      baseline
                    </Link>
                  ) : null}
                  {candidateRunsByCaseId?.get(row.caseId) ? (
                    <Link href={`/runs/${candidateRunsByCaseId.get(row.caseId)}`} className="text-sky-400 hover:underline">
                      candidate
                    </Link>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
