'use client';

import type { FlowTraceEvent } from '@axplane/flow-canvas/components';
import { DispatcherTracePanel } from '@/components/dispatcher-trace-panel';

/**
 * Observatory right panel (Slice B2) — live model reasoning surfaced from the
 * same `FlowTraceEvent[]` the canvas paints, above the existing
 * `DispatcherTracePanel` (inline Langfuse generations + deep link).
 *
 * The thinking list is derived from `kind: 'thinking'` events so the panel needs
 * no second data source; `traceId` feeds the Langfuse panel (seeded from the URL
 * until Slice C wires the active run's trace id through).
 */
export function ObservatoryTracePanel({
  events,
  traceId,
}: {
  events: FlowTraceEvent[];
  traceId?: string | null;
}) {
  const thoughts = events.filter(
    (e): e is Extract<FlowTraceEvent, { kind: 'thinking' }> => e.kind === 'thinking',
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-3 py-2 text-sm font-medium text-muted-foreground">
          Reasoning
        </div>
        <div className="max-h-[40vh] space-y-2 overflow-auto px-3 py-3">
          {thoughts.length ? (
            thoughts.map((t) => (
              <div
                key={t.seq}
                className="whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground"
              >
                {t.stage ? (
                  <span className="mr-1 rounded bg-muted px-1 text-[10px] uppercase tracking-wide">
                    {t.stage}
                  </span>
                ) : null}
                💭 {t.text}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              Model reasoning streams here as the dispatcher thinks.
            </p>
          )}
        </div>
      </div>

      {/* Inline Langfuse generations + deep link (full trace depth). */}
      {traceId ? (
        <DispatcherTracePanel traceId={traceId} live />
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Langfuse trace detail appears here once a trace id is attached to the run.
        </div>
      )}
    </div>
  );
}
