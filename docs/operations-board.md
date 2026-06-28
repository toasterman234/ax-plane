# Operations board

Kanban view at **`/operations/board`** — unified "where is my work?" for requests, runs, and approvals.

**Design:** Option A (status projection). No `board_*` tables; columns are derived from Postgres on every request. See [issue #13](https://github.com/toasterman234/ax-plane/issues/13).

## Data flow

```txt
GET /operations/board
  → buildOperationsBoard(repo)     apps/api/src/operations-board.ts
  → listRequests + listRuns + listApprovals(pending)
  → latest top-level run per requestId (skips child runs)
  → bucket into lifecycle columns
  → JSON { columns, counts, generatedAt }
```

The web app polls every **3s** (TanStack Query). Run detail still uses SSE on `/runs/:id/stream`.

## Columns

| Column | Assignment rule |
|--------|-----------------|
| **Inbox** | Request `status: new`, no run |
| **Ready** | Request routed, no run |
| **Queued** | Latest run `status: queued` |
| **Running** | Latest run `status: running` |
| **Needs approval** | Pending approval rows, or run `needs_approval` |
| **Done** | Latest run `completed` |
| **Failed** | Latest run `failed` or `cancelled` |

## Query params

| Param | Effect |
|-------|--------|
| `agentId` | Filter cards by request agent or run agent |
| `runKind` | `agent` \| `graph` \| `axflow` \| `axdispatcher` |
| `attention=true` | Inbox, Ready, Running, Needs approval, Failed only |

## UI actions

| Action | API |
|--------|-----|
| Start run (button or drag) | `POST /runs` `{ requestId }` |
| Open run | Navigate to `/runs/:id` |
| Review approval | `/operations/approvals` |
| New request | `POST /requests` `{ body, autoStart: false }` |
| Inspect card | Click card body (kanban) or row (list) → side panel |

## Inspect panel

Click a card body (kanban) or list row to open a slide-over panel without leaving the board.

- **Live data:** fetches `GET /requests/:id`, and when a run exists `GET /runs/:id` + pending approvals
- **Shows:** full request body, routing decision, run status, pending approvals, last 6 run events
- **Actions:** Start run, Open run, Review approvals
- **Dismiss:** Escape, backdrop click, or Close button

## View modes

| Mode | Description |
|------|-------------|
| **Kanban** (default) | Horizontal columns with dnd-kit drag-to-start |
| **List** | Flat table sorted by `updatedAt`; column badge per row |

View preference persists in `localStorage` (`axplane-operations-board-view`).

## KPI strip

Six tiles above the toolbar: **Total**, **Ready** (Inbox + Ready), **Active** (running count from API), **Approvals**, **Done**, **Failed**.

## Kanban polish

- **Column tints:** Kilroy-style background per column (`COLUMN_TONE` in `board-types.ts`)
- **Column dots:** Color-coded status dot in each column header
- **Hide empty columns:** Toggle (default on); always shows Ready, Queued, Running, Needs approval even when empty

## Drag-and-drop (dnd-kit)

- **Draggable:** cards in Inbox / Ready (no run yet) — grip handle on the left
- **Drop targets:** Queued or Running columns → same as Start run
- Other columns are read-only (position is server-projected)

Components: `apps/web/app/operations/board/` (`page.tsx`, `board-kanban.tsx`, `board-list.tsx`, `board-kpi-strip.tsx`, `board-inspect-panel.tsx`, `board-card.tsx`, `board-types.ts`).

## Dev notes

- The API dev process uses `tsx src/server.ts` **without watch** (`scripts/supervise-service.mjs`). After API changes, restart the stack or kill the API child so the supervisor respawns it.
- Verify: `curl -s http://localhost:8797/operations/board | jq '.counts'`

## Deferred (not v1)

- Curated boards / domain stage columns (Option B — ben-agents3 ledger pattern)
- SSE push instead of poll
- Drag to Done/Failed (no backing API)
