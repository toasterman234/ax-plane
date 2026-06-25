# AxPlane MVP — Agent Handoff

**Repo:** `ax-lab/axplane/` (inside `~/Projects/ax-lab`)  
**Issue:** [toasterman234/ax-lab#3](https://github.com/toasterman234/ax-lab/issues/3)  
**Last updated:** 2026-06-25 (flow-canvas + governed axflow proxy)  
**Last commit:** *(pending — flow-canvas package, `/ax-flows`, axflow worker)*

---

## 1. What this is

**AxPlane** is a local-first **control plane** around `@ax-llm/ax`.

- **Ax** = agent/runtime layer (signatures, tool calling, RLM pipeline, telemetry)
- **AxPlane** = control plane (requests, runs, policy, approvals, durable event log, dashboard)

**Architectural rule:** The UI never calls Ax. Flow is:

```txt
web → API → worker → @axplane/runtime → @axplane/ax-adapter → guardedHostTool → Postgres events → SSE → dashboard
```

**Pi is out of scope.** AxPlane stays a separate Ax-only control plane. Ben's governed pi stack (`~/Projects/pi`, agent-runner, ben-agents3) is a different runtime boundary — do not wire `piRuntimeAdapter` or merge MCP/subagent surfaces from pi here.

**Graph rule (DECISIONS 0007):** Multi-agent workflows are **control-plane child runs** with handoffs — not in-process ax `agent()` child loops.

---

## 2. What works (validated)

### Core loop (Phases 0–5 + Steps A–H)

| Step | Deliverable | Status |
|------|-------------|--------|
| **A** | Mock MVP end-to-end | ✅ |
| **B** | Structured run detail UI | ✅ |
| **C** | Real Ax mode (`native` + `rlm`) | ✅ |
| **D** | Approval resume (`run.resumed`, idempotent tools) | ✅ |
| **E** | Read-only host tools | ✅ |
| **F** | Approval-gated write tools | ✅ |
| **G** | Agent config editor + version history | ✅ |
| **H** | Request router (keyword / default / explicit) | ✅ |

### Step I-lite

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **I-lite-a** | `POST /agents`, duplicate agent, create-agent UI | ✅ |
| **I-lite-b** | Per-agent `models.primary` / `fallback`, Models card in editor | ✅ |
| **I-lite-c** | `custom_tools` table, HTTP tools (`http.{name}`), `/tools` page | ✅ |

### Step I proper

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **Memory kernel** | `memory_entries` table, `memory.save` / `search` / `list`, auto-inject at run start (`memory.injected`), `/memory` UI | ✅ |
| **Eval lab** | `eval_suites` / `eval_cases` / `eval_runs`, deterministic scoring, `/eval` UI | ✅ |
| **Graph workflows** | `graph_workflows`, parent/child runs, `executeGraphRun`, `/workflows` UI + **builder**, `POST /workflows` upsert | ✅ |
| **Flow canvas** | `@axplane/flow-canvas`, graph + axflow overlays on run detail, `/workflows` topology panel | ✅ |
| **Ax flows (governed)** | `runKind: axflow`, worker → ax-server SSE, `axflow.*` events, `/ax-flows` catalog + live run | ✅ |

### Agent Lab

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **Mock optimize loop** | `optimization_runs`, `agent_candidates`, Agent Lab tab, promote → `agent_versions` | ✅ |
| **Real `agent.optimize()`** | `ax-native` optimizer via `@axplane/ax-adapter` | ✅ |

### Runtime layer

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **`@axplane/runtime`** | `RuntimeAdapter`, `runAgentForConfig`, Ax impl, worker/API wired | ✅ |
| **`pi` runtime** | **Out of scope** — `piRuntimeAdapter` stub fails loud by design; AxPlane stays Ax-only | 🚫 |

### Step I — not built yet

- Scheduling (cron / delayed runs)
- Graph **delete**, parallel steps, conditional edges, visual DAG editor → `docs/workflows-roadmap.md`

### Ax surface vs axllm.dev

> **Full grid:** `docs/ax-surface-map.md` — keep in sync with this table when capabilities change.

| Surface | AxPlane |
|---------|---------|
| `ax()` structured generation | ✅ partial (native real mode) |
| Tools `fn()` (host + HTTP) | ✅ |
| MCP / `discover()` / `recall()` | ❌ (memory kernel + host tools instead) |
| `agent()` RLM + `agent.optimize()` | ✅ (Agent Lab) |
| Ax `flow()` / AxFlow | ⚠️ partial — governed proxy to ax-server (`runKind: axflow`); graph child runs for multi-agent |
| Top-level `optimize()` / GEPA | ❌ |
| Audio / multimodal / token streaming to UI | ❌ |
| `AxBalancer` / OTel | ❌ |
| Control plane (requests, approvals, SSE, eval) | ✅ AxPlane-only |

**Pi runtime:** out of scope — separate from ben-agents3 / `~/Projects/pi`.

### Request routing

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **Keyword router** | keywords, default, explicit, manual override | ✅ |
| **LLM router** | `AXPLANE_ROUTER_MODE=llm\|hybrid`, mock + real classifier | ✅ |

### Test / build status (last run)

```bash
pnpm db:migrate   # through 0005_agent_lab.sql
pnpm typecheck    # green
pnpm test         # ~55 tests, green
```

Real-mode smoke:

```bash
AXPLANE_EXECUTION_MODE=real pnpm --filter @axplane/ax-adapter exec tsx scripts/smoke-real.ts
```

---

## 3. How to run locally

```bash
cd ~/Projects/ax-lab/axplane
cp .env.example .env
docker compose up -d           # Postgres on host port 5433
pnpm install
pnpm db:migrate
pnpm db:seed                   # default agent + sample request
pnpm dev                       # api + worker + web (web defaults to 3010)
```

**Open:**

| Service | URL |
|---------|-----|
| Web | **http://localhost:3010** (default; ax-studio often owns 3000) |
| API health | http://localhost:**8797**/health → `{"ok":true,"service":"axplane-api"}` |
| cliproxy (real mode) | http://127.0.0.1:8317/v1 |

**First-time UI checklist:**

1. Confirm banner is clear (not red) — API + worker healthy
2. **Agents → Install default agent** (if list empty)
3. **Requests → Submit** (router picks agent)
4. **Start run** on the request
5. Run detail streams events live over SSE
6. When `needs_approval` → **Approvals → Approve** → worker resumes

**Graph workflow checklist:** see `docs/workflows.md` (builder + sample seed).

1. **Workflows → New workflow** (or edit) **or** `POST /workflows/seed-default` for sample
2. Pick a request → **Start workflow run**
3. Open parent run → **Graph steps** shows child runs (`lookup`, `summarize`)

**Roadmap:** delete / parallel / visual DAG → `docs/workflows-roadmap.md`

---

## 4. Execution modes

### Mock (default in `.env.example`)

```env
AXPLANE_EXECUTION_MODE=mock
```

Deterministic demo — no LLM key. Mock runner only invokes tools listed on the agent config (graph demo agents avoid always hitting `fake.riskyAction`).

### Real (Ben's machine)

```env
AXPLANE_EXECUTION_MODE=real
AXPLANE_REAL_STRATEGY=native
AX_BASE_URL=http://127.0.0.1:8317/v1
AX_API_KEY=sk-cliproxy
AX_MODEL=gemini-3-flash
```

Use `AXPLANE_REAL_STRATEGY=rlm` for the `agent()` JS-runtime pipeline (optional).

---

## 5. Architecture map

```txt
apps/web          Next.js dashboard
apps/api          Hono API + SSE (/runs/:id/stream)
apps/worker       Polls queued runs; graph parent runs execute child runs inline

packages/db       Drizzle schema, repositories, migrations 0000–0005
packages/events   Event taxonomy + Zod schemas
packages/policy   allow / block / approval_required
packages/host-tools   repo, docs, github, shell, custom HTTP tools
packages/agents   YAML config, tool descriptors, routing, models, templates
packages/router   Request classification (keyword / default / llm / hybrid)
packages/runtime  RuntimeAdapter facade (ax wired, pi stub)
packages/runtime-dev   Dev worker lock + heartbeat for health checks
packages/ax-adapter   mock + real Ax runner, optimize, guardedHostTool, resume, memory inject
packages/lab        Agent Lab optimizer workflow + comparison
packages/memory   Scoring, kernel inject, memory.* tool execution
packages/eval     Deterministic eval scoring + suite runner
packages/graph    Workflow defs, template resolution, executeGraphRun
```

**DB migrations:**

| File | Adds |
|------|------|
| `0000_fat_sumo.sql` | Core schema |
| `0001_custom_tools.sql` | `custom_tools` |
| `0002_memory_entries.sql` | `memory_entries` |
| `0003_eval_lab.sql` | Eval tables |
| `0004_graph_workflows.sql` | `graph_workflows`, `runs.parent_run_id`, `step_key`, `run_kind` |
| `0005_agent_lab.sql` | `optimization_runs`, `agent_candidates`, `eval_suites.agent_id` |

---

## 6. Key files

| Area | Path |
|------|------|
| Default agent YAML | `packages/agents/config/default-agent.yaml` |
| Agent models / templates | `packages/agents/src/models.ts`, `templates.ts` |
| Agent editor UI | `apps/web/app/agents/[id]/agent-editor.tsx` |
| Tools UI | `apps/web/app/tools/page.tsx` |
| Memory UI | `apps/web/app/memory/page.tsx` |
| Eval UI | `apps/web/app/eval/page.tsx` |
| Workflows UI | `apps/web/app/workflows/page.tsx`, `workflow-builder.tsx` |
| Workflow upsert schema | `packages/graph/src/schema.ts` |
| Run detail UI | `apps/web/app/runs/[id]/run-detail.tsx` |
| API server | `apps/api/src/server.ts` |
| Worker | `apps/worker/src/worker.ts` |
| Ax adapter | `packages/ax-adapter/src/index.ts` |
| Memory inject | `packages/ax-adapter/src/memory-context.ts` |
| Graph executor | `packages/graph/src/executor.ts` |
| Bundled sample workflow | `packages/graph/src/bundled.ts` (`lookup_summarize`) |
| Eval scoring | `packages/eval/src/scoring.ts` |
| Router logic | `packages/router/src/index.ts` |
| DB repositories | `packages/db/src/repositories.ts` |
| Agent Lab UI | `apps/web/app/agents/[id]/agent-lab.tsx` |
| API health banner | `apps/web/lib/api-health.tsx` |
| Ax optimize | `packages/ax-adapter/src/optimize-agent.ts` |
| LLM router | `packages/router/src/llm-router.ts` |
| Runtime facade | `packages/runtime/src/factory.ts` |

---

## 7. API endpoints (current)

```txt
GET    /health                      # includes router.mode

GET    /tools
POST   /tools
DELETE /tools/:qualifiedName

GET    /memory
POST   /memory

GET    /eval/suites
POST   /eval/suites
POST   /eval/suites/seed-smoke
POST   /eval/suites/seed-demo            # deprecated alias
GET    /eval/suites/:id
GET    /eval/runs
GET    /eval/runs/:id
POST   /eval/runs

GET    /workflows
POST   /workflows                    # create/upsert workflow definition
POST   /workflows/seed-default
POST   /workflows/seed-demo              # deprecated alias
GET    /workflows/:id

GET    /agents
POST   /agents
POST   /agents/seed-default
POST   /agents/seed-demo                 # deprecated alias
GET    /agents/:id
GET    /agents/:id/versions
PATCH  /agents/:id
POST   /agents/:id/versions
POST   /agents/:id/duplicate

GET    /agents/:id/lab/suites
POST   /agents/:id/lab/suites/seed-smoke
POST   /agents/:id/lab/suites/seed-demo  # deprecated alias
POST   /agents/:id/lab/baseline-eval
POST   /agents/:id/lab/optimize
GET    /agents/:id/lab/optimization-runs
GET    /agents/:id/lab/candidates
GET    /agents/:id/lab/comparison
POST   /agents/:id/lab/candidates/:candidateId/promote
POST   /agents/:id/lab/candidates/:candidateId/reject

GET    /requests
GET    /requests/:id
POST   /requests                    # auto-route; optional agentId, autoStart
POST   /requests/:id/route

GET    /runs
POST   /runs                        # { requestId, agentId? } or { requestId, workflowId }
GET    /runs/:id                    # includes children[] for graph parents
GET    /runs/:id/children
GET    /runs/:id/events
GET    /runs/:id/stream
POST   /runs/:id/cancel

GET    /approvals
POST   /approvals/:id/approve
POST   /approvals/:id/reject
```

---

## 8. Gotchas (read before debugging)

### Port 8787 is Kilroy, not AxPlane

On Ben's machine, **8787 = Kilroy**. AxPlane API defaults to **8797**.

- Root `.env`: `API_PORT=8797`, `NEXT_PUBLIC_API_URL=http://localhost:8797`
- Web: `apps/web/.env.local` must match (Next.js does not read root `.env` for `NEXT_PUBLIC_*`)

**Symptom:** Submit does nothing, banner red or stuck.  
**Fix:** Restart web after `.env.local` change; confirm `8797/health` returns `"service":"axplane-api"`.

### Web port 3000 vs 3010

**ax-studio** often owns **3000**. Web dev now defaults to **3010** (`WEB_PORT` in `.env.example`, `apps/web/package.json`).

If `pnpm dev` shows `EADDRINUSE :::3000`, web may have exited while api/worker keep running — UI looks broken or missing.

```bash
WEB_PORT=3010 pnpm --filter @axplane/web dev
# or rely on new default after pull
```

### White UI + stuck on "Checking API…"

Two common causes (often together):

1. **Stale `.next`** after `pnpm build` while `next dev` was running → CSS 404 → all white, unstyled page
2. **API not running** → health banner hangs (now has 5s timeout) or shows red error

**Fix:**

```bash
pkill -f "axplane/apps/web"    # or kill :3010
rm -rf apps/web/.next
pnpm dev                       # or restart api + worker + web separately
```

Hard-refresh browser (Cmd+Shift+R) on **http://localhost:3010**.

### Postgres on 5433

Host 5432 in use → docker-compose maps to **5433**. Match `DATABASE_URL` in `.env`.

### Only one worker

Multiple `pnpm dev` / `pnpm dev:worker` instances cause duplicate processing and event seq collisions.

```bash
pkill -f "axplane/apps/worker"
pkill -f "axplane/apps/api"
pnpm dev   # one instance only
```

Worker uses **atomic claim** (`claimQueuedRun`). Child graph runs are **not** independently queued (`parent_run_id IS NOT NULL` excluded from poll).

### Tool name collisions → HTTP 400 in real mode

Cliproxy/Gemini rejects duplicate bare function names. **Fixed:** LLM-facing names are `repo_readFile`, etc. Policy/DB still use qualified names (`repo.readFile`).

### Graph runs and approvals

If a **child** step hits `needs_approval`, the **parent** graph run pauses. After approve/reject on the child, worker calls `resumeGraphRunAfterApproval` to continue the graph.

### Smoke eval suite

Seeded `Smoke` suite may have old cases in DB if seeded before mock-tool fix. Legacy name `Demo smoke` still resolves on re-seed. Re-seed or edit cases — case 1 should use safe-tool criteria (not `fake.riskyAction` unless testing approval).

### LLM routing

Set `AXPLANE_ROUTER_MODE=hybrid` (or `llm`) in `.env` and restart API. Mock mode uses a deterministic classifier without API keys. See `docs/router-llm.md`.

---

## 9. Agent config & routing

**Default agent ID:** `default_ax_agent` (legacy `demo_ax_agent` may exist in older DBs — run `POST /agents/seed-default` or `pnpm db:seed`)

**Bundled workflow agents:** `workflow_lookup_agent`, `workflow_summarize_agent` (via `POST /workflows/seed-default`)

**Agent editor:** `/agents/:id` — tools, policies, routing keywords, per-agent models, memory inject settings.

**Router keywords** (default): `approval`, `plan`, `fake`, `risky` + `isDefault: true`.

**Memory:** Agents can set `memory.kernelInject: true` and `memory.injectLimit`. Kernel searches `memory_entries` at run start and emits `memory.injected`.

---

## 10. Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| All white, no sidebar styling | Stale `.next`, CSS 404 | `rm -rf apps/web/.next`, restart web on 3010 |
| Stuck "Checking API…" | API down or wrong port | `pnpm dev:api` or full `pnpm dev`; use 8797 |
| `pnpm dev` but no web | Port 3000 busy, web exited | Use 3010 default or `WEB_PORT=3010` |
| Submit silent | Wrong API port (8787 = Kilroy) | Use 8797, restart web |
| Red API banner | Stack not running | `pnpm dev` |
| `Generate failed: HTTP 400` | cliproxy down or old tool naming | Check cliproxy; pull latest adapter |
| Run `failed` instantly | Multiple workers / DB seq race | Kill extra workers, retry |
| Approvals empty | No run reached risky tool | Start run; use approval keywords |
| Runs stay `queued` | Worker crashed | Check worker logs |
| Graph parent stuck | Child needs approval | Approve child run; worker resumes graph |
| Real mode slow | cliproxy + gemini | Normal |

---

## 11. Manual test scripts

### Happy path (single agent)

```bash
curl http://localhost:8797/health
curl -X POST http://localhost:8797/agents/seed-default
curl -X POST http://localhost:8797/requests \
  -H 'Content-Type: application/json' \
  -d '{"body":"Create a plan and use the fake risky tool for approval testing."}'
# POST /runs with requestId → poll → approve → completed
```

### Graph workflow

```bash
curl -X POST http://localhost:8797/workflows/seed-default
curl -X POST http://localhost:8797/runs \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"<REQUEST_ID>","workflowId":"lookup_summarize"}'
curl http://localhost:8797/runs/<PARENT_RUN_ID>
curl http://localhost:8797/runs/<PARENT_RUN_ID>/children
```

### Memory

```bash
curl -X POST http://localhost:8797/memory \
  -H 'Content-Type: application/json' \
  -d '{"key":"demo","content":"Operator prefers terse summaries.","tags":["preference"]}'
curl 'http://localhost:8797/memory?limit=10'
```

### Eval

```bash
curl -X POST http://localhost:8797/eval/suites/seed-smoke
curl -X POST http://localhost:8797/eval/runs \
  -H 'Content-Type: application/json' \
  -d '{"suiteId":"<SUITE_ID>","agentId":"default_ax_agent"}'
```

---

## 12. Session summary for next agent

You inherit a **working MVP control plane** through Step I, I-lite, Agent Lab (mock + ax-native optimize), runtime adapters, optional LLM routing, **linear graph workflows with builder UI**, and **governed axflow runs** (flow-canvas + `/ax-flows` proxy to ax-server `:8810`). Last pushed commit: see `git log -1`.

**Operational hazards on Ben's machine:**

- **8797** not 8787 (Kilroy)
- **3010** not 3000 (ax-studio)
- **8810** ax-server must be up for `/ax-flows` and `runKind: axflow`
- **Stale `.next`** → white broken UI
- **Multiple workers** → run failures

**Suggested next work (pick one):**

1. **Workflow Phase 1** — `DELETE /workflows/:id` + UI (`docs/workflows-roadmap.md`)
2. **Scheduling** — delayed/cron run enqueue
3. **Axflow polish** — approval gates, Requests-page queue, Langfuse overlay

**Explicitly not planned:** governed pi runtime / pi MCP bridge — keep AxPlane separate from `~/Projects/pi`.

### Documentation index (keep in sync)

| Doc | Purpose |
|-----|---------|
| `HANDOFF.md` | Operator brief + status matrix (this file) |
| `docs/ax-surface-map.md` | axllm.dev vs AxPlane — **full** capability grid |
| `docs/workflows.md` | Current graph workflow behavior + API |
| `docs/flow-canvas.md` | ax-studio canvas port + `/ax-flows` |
| `docs/workflows-roadmap.md` | Delete / DAG v2 / parallel / visual plan |
| `docs/agent-lab.md` | Agent Lab + optimize |
| `docs/runtime-adapters.md` | Runtime facade; pi out of scope |
| `docs/router-llm.md` | LLM request routing |

**Sync rule:** When AxPlane gains or drops an Ax-surface capability, update **`docs/ax-surface-map.md`** and the **Ax surface** table in §2 above. When workflow executor/UI changes, update **`docs/workflows.md`**, **`docs/workflows-roadmap.md`**, and §2 Graph workflows row.

**Start here:** read this file → `README.md` → `pnpm db:migrate` → confirm `8797/health` → open **http://localhost:3010** → walk §11 happy path.
