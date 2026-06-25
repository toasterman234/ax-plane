'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  deriveDispatcherTraceOverlay,
  DISPATCHER_FLOW_ENTRY,
  readAxDispatcherRunInput,
} from '@axplane/flow-canvas';
import { FlowCanvas } from '@axplane/flow-canvas/components';
import { Card } from '@/components/ui/card';
import type { RunEvent } from './run-detail-derive';

type Run = {
  id: string;
  status: string;
  inputJson?: unknown;
  outputJson?: unknown;
  runKind?: string;
};

export function DispatcherRunCanvasPanel({
  run,
  events,
}: {
  run: Run;
  events: RunEvent[];
}) {
  const dispatcherInput = readAxDispatcherRunInput(run.inputJson);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const overlay = useMemo(
    () => deriveDispatcherTraceOverlay({ events, parentOutput: run.outputJson }),
    [events, run.outputJson],
  );

  if (!dispatcherInput) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Dispatcher team topology</h2>
        <p className="text-sm text-muted-foreground">
          Governed ax-server <code className="text-xs">/dispatcher</code> run — dynamic team delegation
        </p>
      </div>
      <div className="h-[440px] bg-card">
        <FlowCanvas
          spec={DISPATCHER_FLOW_ENTRY.spec}
          overlay={overlay}
          selectedNodeId={selectedNodeId}
          onNodeClick={(nodeId) => {
            if (nodeId === '__in' || nodeId === '__out') setSelectedNodeId(null);
            else setSelectedNodeId(nodeId);
          }}
        />
      </div>
      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Proxied via AxPlane worker; events in run log as <code>dispatcher.*</code>. Live runs on{' '}
        <Link href="/dispatcher" className="text-sky-400 hover:underline">
          Dispatcher
        </Link>
        .
      </div>
    </Card>
  );
}
