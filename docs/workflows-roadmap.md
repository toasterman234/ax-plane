# Graph workflows roadmap

> **Current behavior:** `docs/workflows.md`  
> **Executor:** `packages/graph/src/executor.ts` (linear `for` loop over `steps[]`)  
> **Checkpoint:** 2026-06-25 — builder UI + `POST /workflows` shipped; delete / parallel / visual **not** built.

**Sync rule:** When a roadmap phase ships, update this file, `docs/workflows.md`, and `HANDOFF.md` §2 (Graph workflows row) + §12.

---

## Current state (shipped)

| Item | Status |
|------|--------|
| Linear step list in `graph_workflows.steps` | ✅ |
| `executeGraphRun` sequential child runs | ✅ |
| Template vars `{{taskText}}`, `{{steps.<id>.output.answer}}` | ✅ |
| `POST /workflows` create/upsert | ✅ |
| `GET /workflows`, `GET /workflows/:id` | ✅ |
| `POST /workflows/seed-default` (+ deprecated `seed-demo`) | ✅ |
| Workflows UI: list, **New/Edit builder**, start run | ✅ |
| Approval pause/resume on child run | ✅ |

**Not shipped:**

| Item | Status |
|------|--------|
| `DELETE /workflows/:id` | ❌ Phase 1 |
| Parallel steps (diamond, fan-out/join) | ❌ Phase 3 |
| Conditional edges | ❌ Phase 4 |
| Visual DAG editor (canvas) | ❌ Phase 5 |
| Graph model v2 (nodes + edges) | ❌ Phase 2 |

---

## Assessment

The executor is **intentionally linear**:

```txt
graphState.stepIndex → for each step → one child run → await → handoff
```

- Storage: JSON **array** of steps (order = execution order).
- UI builder matches that model.
- Runs store `workflowId` in `input_json`; no FK on `graph_workflows` → delete is mostly policy.

| Gap | Complexity | Main touchpoints |
|-----|------------|------------------|
| Delete workflow | Low | API, repo, UI |
| Graph model v2 (DAG) | Medium | migration, types, adapter |
| Parallel execution | High | executor rewrite, state machine, tests |
| Conditional branching | Higher | edge conditions + executor |
| Visual editor | Medium–high | UI (xyflow); depends on v2 model |

**Do not** attach a visual canvas to the linear array — adopt **graph v2** first, then canvas.

---

## Phase 1 — Delete workflow (0.5–1 day)

**API:** `DELETE /workflows/:id`

**Repo:** `deleteGraphWorkflow(id)`

**Policy (recommended):** **Lenient** — allow delete even if historical runs reference `workflowId` in `input_json` (runs remain auditable).

**UI:** Delete button + confirm on each definition row.

**Tests:** 404 on missing id; recreate after delete.

**Migration:** none.

---

## Phase 2 — Graph model v2: DAG definition (2–3 days)

**Goal:** `nodes` + `edges` AST; v1 `steps[]` remains via adapter.

**Migration `0006_graph_workflow_v2.sql` (sketch):**

- Add `definition_json` (or version column + unified JSON).
- v1 rows: `version: 1` implicit from `steps` array only.

**Types** (`packages/graph/src/types.ts`):

```txt
nodes: agent | join | end
edges: { from, to, when? }   # when unused until Phase 4
```

**Adapter:** `linearStepsToV2(steps)` for existing workflows.

**API:** `POST /workflows` accepts v1 or `version: 2`.

**UI:** Keep linear builder as “Simple”; add “Advanced JSON” for v2 dev escape hatch.

**Tests:** v1 workflows still execute; v2 chain ≡ v1 behavior.

---

## Phase 3 — Parallel execution (3–5 days)

**Executor:** frontier scheduler instead of `stepIndex` loop.

```txt
graphState: completed nodes, running child map, stepOutputs, pending joins
```

1. Ready nodes = inbound edges satisfied (`when` always true in Phase 3).
2. Run ready **agent** nodes in parallel (cap `AXPLANE_GRAPH_MAX_PARALLEL`, default 3).
3. **Join** node: fires when all inbound complete; merge policy (default: concat `answer` with `---`).
4. Approval: pause parent; store frontier + `pendingChildRunId`; resume continues scheduler.

**Events:** `graph.node.started` / `graph.node.completed` (or extend `graph.step.*`).

**UI:** Run detail — group parallel children.

**Tests:** diamond A → B,C → D; approval mid-parallel; one branch fails → parent fails.

---

## Phase 4 — Conditional branching (2–3 days)

**Conditions (start minimal, deterministic only):**

```txt
always
output_contains { stepId, text }
```

Evaluated from `stepOutputs` — **no LLM branch picker** in v1.

**UI:** per-edge condition in builder (requires edge list or visual editor).

**Defer:** LLM routing, dynamic map/fan-out over arrays.

---

## Phase 5 — Visual graph editor (4–6 days)

**Depends on:** Phase 2 (v2 model). Phase 3 needed for fork/join nodes.

**Stack:** `@xyflow/react` — custom `AgentNode`, `JoinNode`; side panel reuses builder fields.

**UX:**

- **Simple | Visual** tabs on `/workflows`.
- Simple → linear form (exports v1 or auto v2 chain).
- Visual → edit nodes/edges → `POST /workflows` v2.
- Validate: no orphan nodes, no invalid cycles, agents exist.

**Optional:** read-only canvas on parent run detail from `graph.*` events.

**Out of scope v1:** live animation, nested sub-workflows, Ax `flow()` import.

---

## Timeline (estimate)

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| 1 | Delete | 0.5–1 d |
| 2 | v2 schema + adapter | 2–3 d |
| 3 | Parallel executor | 3–5 d |
| 4 | Conditional edges | 2–3 d |
| 5 | Visual editor | 4–6 d |

**Total:** ~12–18 focused days.

---

## Recommended ship order

```txt
1. Phase 1 — delete
2. Phase 2 — v2 model (+ JSON advanced mode)
3. Phase 3 — parallel
4. Phase 5 — visual (can follow Phase 2 for linear-only canvas)
5. Phase 4 — conditions (unless if/else needed sooner)
```

---

## Open decisions (Ben)

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | v1 forever? | Yes — adapter keeps `lookup_summarize` working |
| 2 | Parallel cap | Default 3 concurrent child runs |
| 3 | Join merge | Concat `answer` fields with `---` |
| 4 | Delete policy | Lenient (historical runs keep `workflowId` in input) |
| 5 | Pi / Ax Flow | Out of scope — stay control-plane child runs |

---

## Definition of done (full vision)

- Create / edit / **delete** workflows in UI
- Linear and DAG workflows as v2
- Parallel branches with join
- Optional deterministic edge conditions
- Visual canvas + simple linear form
- Parent run shows topology and branch status
