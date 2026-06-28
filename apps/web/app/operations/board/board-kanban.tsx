'use client';

import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
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
  DROP_START_COLUMNS,
  type BoardColumn,
  isColumnDropTarget,
} from './board-types';

function DroppableColumn({
  column,
  onStartRun,
  startingRequestId,
  activeDragId,
}: {
  column: BoardColumn;
  onStartRun: (requestId: string) => void;
  startingRequestId: string | null;
  activeDragId: string | null;
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
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/20 border-t-4',
        COLUMN_ACCENT[column.id] ?? '',
        showDropHint && isOver && 'ring-2 ring-primary bg-primary/5',
        showDropHint && !isOver && 'ring-1 ring-primary/20',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold">{column.label}</h3>
          {acceptsDrop ? (
            <p className="text-[10px] text-muted-foreground">Drop here to start run</p>
          ) : null}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {column.cards.length}
        </span>
      </div>
      <div className="flex max-h-[calc(100vh-18rem)] flex-col gap-2 overflow-y-auto px-2 pb-3">
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
}: {
  columns: BoardColumn[];
  onStartRun: (requestId: string) => void;
  startingRequestId: string | null;
}) {
  const [activeCard, setActiveCard] = useState<{ card: TaskDragData['card']; columnId: string } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const visibleColumns = useMemo(
    () => columns.filter(
      (column) => column.cards.length > 0
        || column.id === 'ready'
        || column.id === 'running'
        || column.id === 'needs_approval'
        || DROP_START_COLUMNS.has(column.id),
    ),
    [columns],
  );

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
      <div className="flex gap-3 overflow-x-auto pb-2">
        {visibleColumns.map((column) => (
          <DroppableColumn
            key={column.id}
            column={column}
            onStartRun={onStartRun}
            startingRequestId={startingRequestId}
            activeDragId={activeCard?.card.requestId ?? null}
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
