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

The web app subscribes via **`GET /operations/board/stream`** (SSE). The server polls Postgres every **1s**, emits a `snapshot` event when the board fingerprint changes, and sends `ping` heartbeats otherwise. Run detail still uses SSE on `/runs/:id/stream`.

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

## Live updates (SSE)

```txt
GET /operations/board/stream[?agentId &runKind &attention]
  → poll buildOperationsBoard every 1s
  → event: snapshot  (full board JSON when fingerprint changes)
  → event: ping       (heartbeat when unchanged)
```

Web hook: `useOperationsBoardStream(queryPath)` — initial REST fetch + EventSource cache updates.

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

- **Live data:** board SSE keeps card column/status in sync; run detail uses `GET /runs/:id/stream` SSE
- **Shows:** full request body (one REST fetch), routing decision, live run status, pending approvals from events, last 6 run events
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
- **Hide empty columns:** Toggle (default on); hides empty terminal columns; pins empty Queued/Running drop targets only when Inbox/Ready or pipeline stages have work

## Drag-and-drop (dnd-kit)

- **Draggable:** cards in Inbox / Ready (no run yet) — grip handle on the left
- **Drop targets:** Queued or Running columns → same as Start run
- Other columns are read-only (position is server-projected)

Components: `apps/web/app/operations/board/` (`page.tsx`, `use-operations-board-stream.ts`, `board-kanban.tsx`, `board-list.tsx`, `board-kpi-strip.tsx`, `board-inspect-panel.tsx`, `board-card.tsx`, `board-types.ts`).

## Dev notes

- The API dev process uses `tsx src/server.ts` **without watch** (`scripts/supervise-service.mjs`). After API changes, restart the stack or kill the API child so the supervisor respawns it.
- Verify: `curl -s http://localhost:8797/operations/board | jq '.counts'`
- SSE: `curl -N http://localhost:8797/operations/board/stream`

## Deferred (not v1)

- Curated boards / domain stage columns (Option B — ben-agents3 ledger pattern)
- Drag to Done/Failed (no backing API)
