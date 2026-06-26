'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import type { FlowSpec } from '../types';
import { specToFlow, type NodeInlineDetail, type TraceOverlay } from '../spec-to-flow';
import { AxNode } from './ax-node';

const nodeTypes = { axNode: AxNode };

const RANK_GAP = 56;
const DEFAULT_H = 64;

function reflowByHeight(nodes: Node[], heights: Record<string, number>): Node[] {
  if (!nodes.length) return nodes;
  const rows = Array.from(new Set(nodes.map((n) => n.position.y))).sort((a, b) => a - b);
  const rowTop: Record<number, number> = {};
  let cursor = 0;
  for (const r of rows) {
    rowTop[r] = cursor;
    const tallest = Math.max(
      DEFAULT_H,
      ...nodes.filter((n) => n.position.y === r).map((n) => heights[n.id] ?? DEFAULT_H),
    );
    cursor += tallest + RANK_GAP;
  }
  return nodes.map((n) => ({ ...n, position: { x: n.position.x, y: rowTop[n.position.y] } }));
}

/** Read-only flow canvas — structure-only show mode (ported from ax-studio). */
export function FlowCanvas({
  spec,
  overlay,
  selectedNodeId,
  onNodeClick,
  details,
  expanded,
  onToggleNode,
  className,
}: {
  spec: FlowSpec | null | undefined;
  overlay?: TraceOverlay;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  details?: Record<string, NodeInlineDetail>;
  expanded?: Set<string>;
  onToggleNode?: (nodeId: string) => void;
  className?: string;
}) {
  const { nodes, edges } = useMemo(() => {
    if (!spec?.nodes?.length) return { nodes: [], edges: [] };
    return specToFlow(spec, overlay, selectedNodeId, { details, expanded, onToggle: onToggleNode });
  }, [spec, overlay, selectedNodeId, details, expanded, onToggleNode]);

  const [heights, setHeights] = useState<Record<string, number>>({});
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setHeights((prev) => {
      let next = prev;
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) {
          const h = Math.round(c.dimensions.height);
          if (h > 0 && prev[c.id] !== h) next = { ...next, [c.id]: h };
        }
      }
      return next;
    });
  }, []);

  const laidOut = useMemo(() => reflowByHeight(nodes, heights), [nodes, heights]);

  if (!spec?.nodes?.length) {
    return (
      <div className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? 'h-full w-full min-h-[320px]'}`}>
        No flow topology available for this entry.
      </div>
    );
  }

  return (
    <div className={className ?? 'h-full w-full min-h-[320px]'}>
      <ReactFlowProvider>
        <ReactFlow
          key={spec.id}
          style={{ width: '100%', height: '100%' }}
          nodes={laidOut}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          nodesDraggable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          onNodeClick={(_, node) => onNodeClick?.(node.id)}
          onInit={(instance) => {
            void instance.fitView({ padding: 0.3 });
          }}
        >
          <Background gap={16} color="#334155" />
          <Controls showInteractive={false} className="!bg-slate-900 !border-slate-700" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
