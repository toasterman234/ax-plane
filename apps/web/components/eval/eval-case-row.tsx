'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { EvalCaseResult } from '@/lib/eval-types';
import { normalizeCaseDetails } from '@/lib/eval-types';
import { cn } from '@/lib/utils';

function statusClass(status: string): string {
  if (status === 'passed') return 'text-emerald-400';
  if (status === 'skipped') return 'text-amber-400';
  return 'text-red-400';
}

type EvalCaseRowProps = {
  result: EvalCaseResult;
  compareResult?: EvalCaseResult | null;
};

export function EvalCaseRow({ result, compareResult }: EvalCaseRowProps) {
  const [open, setOpen] = useState(false);
  const details = normalizeCaseDetails(result.detailsJson);
  const scoreDelta = compareResult != null ? result.score - compareResult.score : null;

  return (
    <li className="rounded-md border border-border text-sm">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-secondary/30"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="font-medium text-foreground">{result.caseName}</span>
        <span className={cn('text-xs uppercase tracking-wide', statusClass(result.status))}>{result.status}</span>
        <span className="text-muted-foreground">{result.score}%</span>
        {scoreDelta != null ? (
          <span className={cn('text-xs', scoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {scoreDelta >= 0 ? '+' : ''}{scoreDelta}% vs compare
          </span>
        ) : null}
        {result.runId ? (
          <Link
            href={`/runs/${result.runId}`}
            className="text-sky-400 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            View run
          </Link>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {details?.results?.length ? (
            <ul className="space-y-1">
              {details.results.map((row, index) => (
                <li key={index} className={row.passed ? 'text-emerald-300/90' : 'text-red-300/90'}>
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">{row.criterion.type}</span>
                  {' · '}
                  {row.message}
                </li>
              ))}
            </ul>
          ) : (
            <p>No criterion breakdown recorded for this case.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
