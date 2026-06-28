'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import {
  BoardCardTile,
  type TaskDragData,
} from './board-card';
import {
  COLUMN_ACCENT,
  COLUMN_DOT,
  COLUMN_TONE,
  DROP_START_COLUMNS,
  filterVisibleColumns,
  type BoardCard,
  type BoardColumn,
  isColumnDropTarget,
} from './board-types';

function DroppableColumn({
  column,
  onStartRun,
  startingRequestId,
  activeDragId,
  onInspect,
  wide,
}: {
  column: BoardColumn;
  onStartRun: (requestId: string) => void;
  startingRequestId: string | null;
  activeDragId: string | null;
  onInspect?: (card: BoardCard, columnId: string) => void;
  wide?: boolean;
}) {
  const acceptsDrop = isColumnDropTarget(column.id);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled: !acceptsDrop,
  });

  const showDropHint = Boolean(activeDragId) && acceptsDrop;

  return (
    <div
      ref={setNodeRef}
      data-has-cards={column.cards.length > 0 ? 'true' : 'false'}
      className={cn(
        'flex shrink-0 flex-col rounded-xl border border-t-4 p-0 shadow-sm',
        wide ? 'min-w-72 flex-1' : 'w-72',
        COLUMN_ACCENT[column.id] ?? 'border-t-border',
        COLUMN_TONE[column.id] ?? 'bg-muted/20',
        showDropHint && isOver && 'ring-2 ring-primary',
        showDropHint && !isOver && acceptsDrop && 'ring-1 ring-primary/25',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', COLUMN_DOT[column.id] ?? 'bg-muted-foreground')} />
            <h3 className="text-sm font-semibold">{column.label}</h3>
          </div>
          {acceptsDrop ? (
            <p className="mt-0.5 pl-3.5 text-[10px] text-muted-foreground">Drop here to start run</p>
          ) : null}
        </div>
        <span className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {column.cards.length}
        </span>
      </div>
      <div className="flex max-h-[calc(100vh-20rem)] flex-col gap-2 overflow-y-auto px-2 pb-3">
        {column.cards.length === 0 ? (
          <p
            className={cn(
              'px-1 py-4 text-center text-xs text-muted-foreground',
              showDropHint && isOver && 'rounded-md border border-dashed border-primary/50 text-primary',
            )}
          >
            {showDropHint && isOver ? 'Release to start run' : 'Empty'}
          </p>
        ) : (
          column.cards.map((card) => (
            <BoardCardTile
              key={card.requestId}
              card={card}
              columnId={column.id}
              onStartRun={onStartRun}
              starting={startingRequestId === card.requestId}
              onInspect={onInspect}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function BoardKanban({
  columns,
  onStartRun,
  startingRequestId,
  hideEmptyColumns,
  onInspect,
}: {
  columns: BoardColumn[];
  onStartRun: (requestId: string) => void;
  startingRequestId: string | null;
  hideEmptyColumns: boolean;
  onInspect?: (card: BoardCard, columnId: string) => void;
}) {
  const [activeCard, setActiveCard] = useState<{ card: TaskDragData['card']; columnId: string } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const visibleColumns = useMemo(
    () => filterVisibleColumns(columns, hideEmptyColumns),
    [columns, hideEmptyColumns],
  );

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const wideColumns = visibleColumns.length <= 3;

  useEffect(() => {
    const container = boardScrollRef.current;
    if (!container) return;
    const firstWithCards = container.querySelector('[data-has-cards="true"]');
    if (firstWithCards) {
      firstWithCards.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    } else {
      container.scrollLeft = 0;
    }
  }, [visibleColumns.map((column) => `${column.id}:${column.cards.length}`).join('|')]);

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as TaskDragData | undefined;
    if (data?.type !== 'Task') return;
    setActiveCard({ card: data.card, columnId: data.sourceColumnId });
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as TaskDragData | undefined;
    if (data?.type !== 'Task') return;

    const targetColumn = String(over.id);
    if (DROP_START_COLUMNS.has(targetColumn) && !data.card.latestRun) {
      void onStartRun(data.card.requestId);
    }
  }

  function onDragCancel() {
    setActiveCard(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div ref={boardScrollRef} className="flex gap-3 overflow-x-auto pb-2">
        {visibleColumns.map((column) => (
          <DroppableColumn
            key={column.id}
            column={column}
            onStartRun={onStartRun}
            startingRequestId={startingRequestId}
            activeDragId={activeCard?.card.requestId ?? null}
            onInspect={onInspect}
            wide={wideColumns}
          />
        ))}
      </div>

      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
              {activeCard ? (
                <BoardCardTile
                  card={activeCard.card}
                  columnId={activeCard.columnId}
                  onStartRun={onStartRun}
                  starting={startingRequestId === activeCard.card.requestId}
                  isOverlay
                />
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
