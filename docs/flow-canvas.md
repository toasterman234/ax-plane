# Flow canvas (ax-studio port)

AxPlane includes a read-only flow canvas ported from **ax-studio** (`components/canvas/*`, `lib/specs/types.ts`). It draws **structure-only** `FlowSpec` graphs — show mode, not authoring.

## Package

`packages/flow-canvas` (`@axplane/flow-canvas`)

| Export | Purpose |
|--------|---------|
| `FlowSpec`, `FlowEntry` | Types shared with ax-studio |
| `fetchAllFlowEntries` | `GET /flow-specs` from ax-server (+ optional sidecars) |
| `graphWorkflowToFlowSpec` | Map AxPlane graph workflows → canvas spec |
| `@axplane/flow-canvas/components` | `FlowCanvas`, `AxNode` (client, `@xyflow/react`) |

## API

- `GET /ax-flows` — catalog from ax-sandbox `ax-server` (`AX_SERVER_URL`, default `:8810`)
- `GET /ax-flows/:id` — single flow entry + spec
- `GET /ax-flows/:id/runs` — engine run history (`runs.jsonl` via ax-server)
- `GET /ax-engine/runs/:runId?flow=` — full engine run detail (per-node text/tokens)
- `POST /ax-engine/flow-run` — proxy live SSE run to canvas (`?stream=1` on ax-server)
- `POST /runs` with `{ requestId, axFlowId, flowInput? }` — governed `runKind: axflow` (worker → ax-server)

## Governed axflow runs

Worker executes `executeAxFlowRun`: streams ax-server SSE, appends `axflow.*` events to Postgres, stores step overlay in `outputJson.axflow`. Orchestrator agent id: `__axflow__`.

## UI

- **`/ax-flows`** — browse engine-registered ax-llm `flow()` programs with canvas
- **`/workflows`** — graph workflow definitions + topology panel for the selected workflow
- **Run detail** (`/runs/[id]`) — graph parent runs show live topology overlay from `graph.step.*` events + child run status

## Graph run overlay

`deriveGraphTraceOverlay` maps parent run events and child runs to `TraceOverlay` for the canvas:

- `graph.step.started` → running
- `graph.step.completed` + child `completed` → ok + output excerpt
- `graph.failed` / child `failed` → error
- `needs_approval` on child → running (paused)

## Env

```bash
AX_SERVER_URL=http://127.0.0.1:8810
# AX_QUANT_FLOW_URL=http://127.0.0.1:8811
# AX_ROUTER_FLOW_URL=http://127.0.0.1:8812
```

## Boundaries

- Canvas is **read-only** (show mode): it does not call `flow().forward()` in the browser.
- **Governed `runKind: axflow` runs** proxy ax-server via the worker (`executeAxFlowRun`); `axflow.*` events land in Postgres and paint the same canvas on run detail.
- AxPlane **graph workflows** remain child-run orchestration — their topology view is a visual map only, not in-process `flow()`.
- **ax-studio** depends on `@axplane/flow-canvas` via `file:../../Projects/ax-lab/axplane/packages/flow-canvas`; studio canvas files are thin re-exports.

## Smoke validation (2026-06-25)

Against ax-server `:8810` + AxPlane API `:8797` (worker `mode: real`):

1. `POST /ax-engine/flow-run` (`research-router`) — SSE `node-start` / `node-end` / `done` ✅
2. `POST /runs` with `{ requestId, axFlowId, flowInput }` — run completes with `axflow.*` events + `outputJson.axflow` overlay ✅
3. `GET /ax-flows/:id/runs` — engine history list for paint ✅
