# AxPlane MVP — Agent Handoff

**Repo:** `ax-lab/axplane/` (inside `~/Projects/ax-lab`)  
**Issue:** [toasterman234/ax-lab#3](https://github.com/toasterman234/ax-lab/issues/3)  
**Last updated:** 2026-06-25  
**Last commit:** `233c851` — Agent Lab + runtime adapter layer

---

## 1. What this is

**AxPlane** is a local-first **control plane** around `@ax-llm/ax`.

- **Ax** = agent/runtime layer (signatures, tool calling, RLM pipeline, telemetry)
- **AxPlane** = control plane (requests, runs, policy, approvals, durable event log, dashboard)

**Architectural rule:** The UI never calls Ax. Flow is:

```txt
web → API → worker → @axplane/runtime → @axplane/ax-adapter → guardedHostTool → Postgres events → SSE → dashboard
```

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
| **Graph workflows** | `graph_workflows`, parent/child runs, `executeGraphRun`, `/workflows` UI | ✅ |

### Agent Lab

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **Mock optimize loop** | `optimization_runs`, `agent_candidates`, Agent Lab tab, promote → `agent_versions` | ✅ |
| **Real `agent.optimize()`** | `ax-native` optimizer type | ❌ (501 until wired) |

### Runtime layer

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **`@axplane/runtime`** | `RuntimeAdapter`, `runAgentForConfig`, Ax impl, worker/API wired | ✅ |
| **Governed `pi` runtime** | `piRuntimeAdapter` | ❌ (fails loud) |

### Step I — not built yet

- Scheduling (cron / delayed runs)
- LLM-based request routing (today: keyword + default + explicit only)

### Test / build status (last run)

```bash
pnpm db:migrate   # through 0005_agent_lab.sql
pnpm typecheck    # green
pnpm test         # ~50 tests, green
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
pnpm db:seed                   # demo agent + sample request
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
2. **Agents → Seed demo agent** (if list empty)
3. **Requests → Submit** (router picks agent)
4. **Start run** on the request
5. Run detail streams events live over SSE
6. When `needs_approval` → **Approvals → Approve** → worker resumes

**Graph demo checklist:**

1. `POST /workflows/seed-demo` or **Workflows → Seed demo workflow**
2. Pick a request → **Start workflow run**
3. Open parent run → **Graph steps** shows child runs (`lookup`, `summarize`)

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

packages/db       Drizzle schema, repositories, migrations 0000–0004
packages/events   Event taxonomy + Zod schemas
packages/policy   allow / block / approval_required
packages/host-tools   repo, docs, github, shell, custom HTTP tools
packages/agents   YAML config, tool descriptors, routing, models, templates
packages/router   Request classification (keyword / default / explicit)
packages/runtime-dev   Dev worker lock + heartbeat for health checks
packages/ax-adapter   mock + real Ax runner, guardedHostTool, resume, memory inject
packages/runtime    RuntimeAdapter facade (ax wired, pi stub)
packages/lab        Agent Lab mock optimizer + comparison workflow
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
| Demo agent YAML | `packages/agents/config/demo-agent.yaml` |
| Agent models / templates | `packages/agents/src/models.ts`, `templates.ts` |
| Agent editor UI | `apps/web/app/agents/[id]/agent-editor.tsx` |
| Tools UI | `apps/web/app/tools/page.tsx` |
| Memory UI | `apps/web/app/memory/page.tsx` |
| Eval UI | `apps/web/app/eval/page.tsx` |
| Workflows UI | `apps/web/app/workflows/page.tsx` |
| Run detail UI | `apps/web/app/runs/[id]/run-detail.tsx` |
| API server | `apps/api/src/server.ts` |
| Worker | `apps/worker/src/worker.ts` |
| Ax adapter | `packages/ax-adapter/src/index.ts` |
| Memory inject | `packages/ax-adapter/src/memory-context.ts` |
| Graph executor | `packages/graph/src/executor.ts` |
| Demo graph workflow | `packages/graph/src/bundled.ts` |
| Eval scoring | `packages/eval/src/scoring.ts` |
| Router logic | `packages/router/src/index.ts` |
| DB repositories | `packages/db/src/repositories.ts` |
| API health banner | `apps/web/lib/api-health.tsx` |

---

## 7. API endpoints (current)

```txt
GET    /health

GET    /tools
POST   /tools
DELETE /tools/:qualifiedName

GET    /memory
POST   /memory

GET    /eval/suites
POST   /eval/suites
POST   /eval/suites/seed-demo
GET    /eval/suites/:id
GET    /eval/runs
GET    /eval/runs/:id
POST   /eval/runs

GET    /workflows
POST   /workflows/seed-demo
GET    /workflows/:id

GET    /agents
POST   /agents
POST   /agents/seed-demo
GET    /agents/:id
GET    /agents/:id/versions
PATCH  /agents/:id
POST   /agents/:id/versions
POST   /agents/:id/duplicate

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

### Eval demo suite

Seeded `Demo smoke` suite may have old cases in DB if seeded before mock-tool fix. Re-seed or edit cases — case 1 should use safe-tool criteria (not `fake.riskyAction` unless testing approval).

### Uncommitted work

Everything after Step H (I-lite, memory, eval, graph, web port fix, health timeout) is **on disk but not committed**. Commit to `ax-lab` when ready — not `ben-agents3`.

---

## 9. Agent config & routing

**Demo agent ID:** `demo_ax_agent`

**Graph demo agents:** `graph_lookup_agent`, `graph_summarize_agent` (seeded via `POST /workflows/seed-demo`)

**Agent editor:** `/agents/:id` — tools, policies, routing keywords, per-agent models, memory inject settings.

**Router keywords** (demo defaults): `approval`, `plan`, `demo`, `fake`, `risky` + `isDefault: true`.

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
curl -X POST http://localhost:8797/agents/seed-demo
curl -X POST http://localhost:8797/requests \
  -H 'Content-Type: application/json' \
  -d '{"body":"Create a plan and use the fake risky tool for approval testing."}'
# POST /runs with requestId → poll → approve → completed
```

### Graph workflow

```bash
curl -X POST http://localhost:8797/workflows/seed-demo
curl -X POST http://localhost:8797/runs \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"<REQUEST_ID>","workflowId":"demo_lookup_summarize"}'
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
curl -X POST http://localhost:8797/eval/suites/seed-demo
curl -X POST http://localhost:8797/eval/runs \
  -H 'Content-Type: application/json' \
  -d '{"suiteId":"<SUITE_ID>","agentId":"demo_ax_agent"}'
```

---

## 12. Session summary for next agent

You inherit a **working MVP control plane** through **Step I** (memory, eval, graph) plus **I-lite** (agent CRUD, per-agent models, HTTP custom tools). All of that is **uncommitted** since `6d0ca04`.

**Operational hazards on Ben's machine:**

- **8797** not 8787 (Kilroy)
- **3010** not 3000 (ax-studio)
- **Stale `.next`** → white broken UI
- **Multiple workers** → run failures

**Suggested next work (pick one):**

1. **Real Ax optimization** — wire `agent.optimize()` for `ax-native` in Agent Lab
2. **Governed pi runtime** — implement `piRuntimeAdapter` against `~/Projects/pi`
3. **Scheduling** — delayed/cron run enqueue
4. **LLM routing** — replace keyword-only router with optional model-based classification

**Start here:** read this file → `README.md` → `pnpm db:migrate` → confirm `8797/health` → open **http://localhost:3010** → walk §11 happy path.
