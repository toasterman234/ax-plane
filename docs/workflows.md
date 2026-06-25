# Graph workflows

AxPlane workflows are **control-plane step graphs**: each step is a separate agent run (child run) with template-based handoffs. This is **not** Ax `flow()` / AxFlow (in-process DAG).

## What the UI does today

The **Workflows** page (`/workflows`) can:

1. **List** workflow definitions
2. **Build or edit** workflows (id, steps, agent per step, input templates)
3. **Install sample workflow** — seeds `lookup_summarize` plus step agents
4. **Start a graph run** — pick a request + workflow → `POST /runs` with `workflowId`

## How to use the sample (quick path)

1. **Agents** → ensure agents exist (install default agent if needed)
2. **Workflows** → **Install sample workflow**
3. **Requests** → submit a task (e.g. `Look up AxPlane and summarize for the operator`)
4. **Workflows** → select the request → **Start workflow run**
5. **Runs** → open the parent run → **Graph steps** shows `lookup` and `summarize` child runs

Or via API:

```bash
curl -X POST http://localhost:8797/workflows/seed-default

curl -X POST http://localhost:8797/runs \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"<REQUEST_ID>","workflowId":"lookup_summarize"}'
```

## Workflow shape

Stored in `graph_workflows` (migration `0004_graph_workflows.sql`):

```json
{
  "id": "lookup_summarize",
  "name": "Lookup then summarize",
  "description": "Two-step graph",
  "steps": [
    {
      "id": "lookup",
      "agentId": "workflow_lookup_agent",
      "inputTemplate": "{{taskText}}"
    },
    {
      "id": "summarize",
      "agentId": "workflow_summarize_agent",
      "inputTemplate": "Summarize the lookup results.\n\nLookup output:\n{{steps.lookup.output.answer}}"
    }
  ]
}
```

### Template variables

Resolved by `packages/graph/src/template.ts`:

| Token | Meaning |
|-------|---------|
| `{{taskText}}` | Original request body |
| `{{steps.<stepId>.output.answer}}` | Prior step's `answer` field (agent output) |
| `{{steps.<stepId>.output}}` | Full prior step output JSON |

Steps run **in order**. Each step's `agentId` must exist in `agents` with a current config version.

## How to author a custom workflow

### Option A — Workflows UI (recommended)

Open **Workflows → New workflow** (or **Edit** on an existing definition). Each step needs an agent that already exists under **Agents**.

### Option B — `POST /workflows`

Each step `agentId` must already exist. Upserts by workflow `id`.

```bash
curl -X POST http://localhost:8797/workflows \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "my_lookup_summarize",
    "name": "My lookup then summarize",
    "description": "Custom two-step graph",
    "steps": [
      {
        "id": "lookup",
        "agentId": "workflow_lookup_agent",
        "inputTemplate": "{{taskText}}"
      },
      {
        "id": "summarize",
        "agentId": "workflow_summarize_agent",
        "inputTemplate": "Summarize:\n{{steps.lookup.output.answer}}"
      }
    ]
  }'
```

Install sample workflow first if you need the bundled step agents:

```bash
curl -X POST http://localhost:8797/workflows/seed-default
```

Validation: workflow `id` and step `id` are lowercase slugs; step ids unique; `__graph__` cannot be a step agent.

### Option C — Fork the bundled seed (dev)

1. Add agents (via **Agents → New agent** or duplicate an existing one)
2. Copy `packages/graph/src/bundled.ts` pattern — new `id`, `steps`, agent IDs
3. Expose a new seed route in `apps/api/src/server.ts` (same pattern as `seed-default`) **or** extend seed-default to register multiple workflows
4. `pnpm dev` → call your seed endpoint → workflow appears in the UI

Reference: `BUNDLED_GRAPH_WORKFLOW` and `BUNDLED_WORKFLOW_AGENTS` in `packages/graph/src/bundled.ts`.

### Option D — Direct DB upsert

Insert into `graph_workflows` with JSON `steps` matching the shape above. Ensure step agents exist first.

## Runtime behavior

- Parent run: `run_kind = graph`, orchestrator agent `__graph__` (not an Ax agent)
- Each step: queued child run → worker executes via `@axplane/runtime` → output stored in parent graph state
- If a child hits `needs_approval`, the **parent pauses** until the child is approved/rejected, then the graph resumes

See `packages/graph/src/executor.ts` and HANDOFF § Graph runs and approvals.

## Related docs

- `HANDOFF.md` — graph checklist, API routes, Ax surface summary (§2)
- `docs/workflows-roadmap.md` — delete, DAG v2, parallel, visual editor plan
- `docs/ax-surface-map.md` — axllm.dev vs AxPlane (graph child-runs vs `flow()`)
- `docs/architecture/overview.md` — control plane vs Ax boundary
