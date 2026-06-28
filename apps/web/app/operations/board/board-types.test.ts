import { describe, expect, it } from 'vitest';
import {
  filterVisibleColumns,
  sortColumnsForDisplay,
  type BoardColumn,
} from './board-types';

function column(id: string, count: number): BoardColumn {
  return {
    id,
    label: id,
    cards: Array.from({ length: count }, (_, index) => ({
      requestId: `${id}-${index}`,
      body: 'task',
      agentId: 'agent',
      routeDecision: null,
      latestRun: null,
      pendingApprovalCount: 0,
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
    })),
  };
}

const ALL_COLUMNS: BoardColumn[] = [
  column('inbox', 0),
  column('ready', 0),
  column('queued', 0),
  column('running', 0),
  column('needs_approval', 0),
  column('done', 0),
  column('failed', 0),
];

describe('filterVisibleColumns', () => {
  it('shows workflow columns plus done when all work is complete', () => {
    const columns = ALL_COLUMNS.map((col) => (col.id === 'done' ? column('done', 50) : col));
    const visible = filterVisibleColumns(columns, true).map((col) => col.id);
    expect(visible[0]).toBe('done');
    expect(visible).toContain('inbox');
    expect(visible).toContain('ready');
    expect(visible).toContain('queued');
    expect(visible).toContain('running');
    expect(visible).toContain('needs_approval');
    expect(visible).not.toContain('failed');
  });

  it('pins empty drop targets when inbox has work', () => {
    const columns = ALL_COLUMNS.map((col) => (col.id === 'inbox' ? column('inbox', 2) : col));
    const visible = filterVisibleColumns(columns, true).map((col) => col.id);
    expect(visible).toContain('inbox');
    expect(visible).toContain('ready');
    expect(visible).toContain('queued');
    expect(visible).toContain('running');
    expect(visible).not.toContain('done');
  });
});

describe('sortColumnsForDisplay', () => {
  it('places non-empty columns before empty ones', () => {
    const columns = [
      column('ready', 0),
      column('done', 2),
      column('inbox', 1),
    ];
    expect(sortColumnsForDisplay(columns).map((col) => col.id)).toEqual(['inbox', 'done', 'ready']);
  });
});
