# AxPlane MVP — Agent Handoff

**Repo:** `ax-lab/axplane/`  
**Issue:** [toasterman234/ax-lab#3](https://github.com/toasterman234/ax-lab/issues/3)  
**Last updated:** 2026-06-25

---

## 1. What this is

**AxPlane** is a local-first **control plane** around `@ax-llm/ax`.

- **Ax** = agent/runtime layer (signatures, tool calling, RLM pipeline, telemetry)
- **AxPlane** = control plane (requests, runs, policy, approvals, durable event log, dashboard)

**Architectural rule:** The UI never calls Ax. The web app → API → worker → `@axplane/ax-adapter` → Postgres events → SSE → dashboard.

---

## 2. What works (validated)

### Core loop (Phases 0–5)

| Step | Status |
|------|--------|
| Postgres schema + `run_events` timeline | ✅ |
| Hono API + SSE live stream | ✅ |
| Worker polling + Ax adapter | ✅ |
| Next.js dashboard (Requests, Runs, Approvals, Agents) | ✅ |
| Mock mode (no API key) | ✅ |
| Real Ax mode via cliproxy | ✅ |
| Approval gate + resume without full rerun | ✅ |

### Post-MVP steps completed in this session

| Step | Deliverable | Status |
|------|-------------|--------|
| **A** | Mock MVP end-to-end | ✅ |
| **B** | Structured run detail UI | ✅ |
| **C** | Real Ax mode (`native` + `rlm`) | ✅ |
| **D** | Approval resume (`run.resumed`, idempotent tools) | ✅ |
| **E** | Read-only host tools (`repo.*`, `docs.search`, `github.read*`, etc.) | ✅ |
| **F** | Approval-gated write tools (`repo.writeFile`, `shell.run`, `github.create*`) | ✅ |
| **G** | Agent config editor (`/agents/:id`, version history) | ✅ |
| **H** | Request router (keyword / default / explicit / override) | ✅ |

### Test status

```bash
pnpm typecheck   # green
pnpm test        # ~29 tests, green (last run)
```

Real-mode smoke (approval resume):

```bash
AXPLANE_EXECUTION_MODE=real pnpm --filter @axplane/ax-adapter exec tsx scripts/smoke-real.ts
```

---

## 3. How to run locally

```bash
cd ~/Projects/ax-lab/axplane   # or external SSD path
cp .env.example .env
docker compose up -d           # Postgres on host port 5433
pnpm install
pnpm db:migrate
pnpm db:seed                   # demo agent + sample request
pnpm dev
```

**Open:**

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 (or **3010** if 3000 busy) |
| API health | http://localhost:**8797**/health → `{"ok":true,"service":"axplane-api"}` |
| cliproxy (real mode) | http://127.0.0.1:8317/v1 |

**First-time UI checklist:**

1. **Agents → Seed demo agent** (if list empty)
2. **Requests → Submit** (router picks agent automatically)
3. **Start run** on the request
4. Run detail page streams events live
5. When status = `needs_approval`, go to **Approvals → Approve**
6. Run completes after worker resumes

---

## 4. Execution modes

### Mock (default in `.env.example`)

```env
AXPLANE_EXECUTION_MODE=mock
```

Deterministic demo — no LLM key. Good for UI/worker/event testing.

### Real (current `.env` on Ben's machine)

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
apps/worker       Polls queued runs, executes via ax-adapter

packages/db       Drizzle schema, repositories, migrations
packages/events   Event taxonomy + Zod schemas
packages/policy   allow / block / approval_required
packages/host-tools   repo, docs, github, shell implementations
packages/agents   YAML config, tool descriptors, routing fields
packages/router   Request classification (keyword / default / explicit)
packages/runtime-dev   Dev worker lock + heartbeat for health checks
packages/ax-adapter   mock + real Ax runner, guardedHostTool, resume
```

**Packages added after initial scaffold:** `host-tools`, `router`

---

## 6. Key files

| Area | Path |
|------|------|
| Demo agent YAML | `packages/agents/config/demo-agent.yaml` |
| Agent editor UI | `apps/web/app/agents/[id]/agent-editor.tsx` |
| Request router UI | `apps/web/app/requests/page.tsx` |
| Run detail UI | `apps/web/app/runs/[id]/run-detail.tsx` |
| API server | `apps/api/src/server.ts` |
| Worker | `apps/worker/src/worker.ts` |
| Ax adapter | `packages/ax-adapter/src/index.ts` |
| Tool builder | `packages/ax-adapter/src/build-functions.ts` |
| Guarded tools | `packages/ax-adapter/src/guarded-tool.ts` |
| Host tool catalog | `packages/host-tools/src/catalog.ts` |
| Router logic | `packages/router/src/index.ts` |
| DB repositories | `packages/db/src/repositories.ts` |

---

## 7. API endpoints (current)

```txt
GET    /health
GET    /tools
GET    /agents
GET    /agents/:id
GET    /agents/:id/versions
PATCH  /agents/:id
POST   /agents/:id/versions
POST   /agents/seed-demo

GET    /requests
GET    /requests/:id
POST   /requests                    # auto-route; optional agentId, autoStart
POST   /requests/:id/route

GET    /runs
POST   /runs                        # agentId optional
GET    /runs/:id
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

On Ben's machine, **8787 = Kilroy** (`{"pipelines":0,"status":"ok"}`). AxPlane API defaults to **8797**.

- Root `.env`: `API_PORT=8797`, `NEXT_PUBLIC_API_URL=http://localhost:8797`
- Web: `apps/web/.env.local` must match (Next.js does not read root `.env` for `NEXT_PUBLIC_*`)

**Symptom:** Submit does nothing, no approvals, no errors.  
**Fix:** Restart web after `.env.local` change; confirm `8797/health` returns `"service":"axplane-api"`.

### Port 3000 often busy

Web may fail with `EADDRINUSE`. Use `pnpm --filter @axplane/web exec next dev -p 3010` or kill the other process.

### Postgres on 5433

Host 5432 in use → docker-compose maps to **5433**. Match `DATABASE_URL` in `.env`.

### Only one worker

Multiple `pnpm dev:worker` / `pnpm dev` instances cause duplicate run processing and event seq collisions. Kill extras:

```bash
pkill -f "axplane/apps/worker"
pkill -f "axplane/apps/api"
pnpm dev   # one instance only
```

Worker now uses **atomic claim** (`claimQueuedRun`) to prevent double-processing.

### Tool name collisions → HTTP 400 in real mode

Cliproxy/Gemini rejects duplicate bare function names across namespaces (e.g. `repo.readFile` + `github.readFile` both named `readFile`).

**Fixed in** `packages/ax-adapter/src/build-functions.ts`: LLM-facing names are `repo_readFile`, `github_readFile`, etc. Policy/DB still use qualified names (`repo.readFile`).

### Approvals empty until a run pauses

Submit alone does not create approvals. Flow: **Submit → Start run → worker hits risky tool → `needs_approval` → Approvals page**.

Use request text with routing keywords: `approval`, `fake`, `risky`, `plan`.

### SSE live updates

API omits custom SSE `event:` field so browser `EventSource.onmessage` works.

### Signature field name

Ax rejects generic `request` in signatures. Use **`taskText`** everywhere.

### Uncommitted work

Steps B–H shipped in commit after handoff checklist (see git log).

---

## 9. Agent config & routing

**Demo agent ID:** `demo_ax_agent`

**14 tools** in catalog — all wired through `guardedHostTool` → policy → `executeHostTool`.

**Agent editor:** `/agents/demo_ax_agent` — edit tools, policies, routing keywords; save creates new DB version.

**Router keywords** (demo agent defaults): `approval`, `plan`, `demo`, `fake`, `risky` + `isDefault: true`.

Configure per-agent in editor **Routing** section.

---

## 10. What's next (not built)

From original roadmap **Step I** — defer until G+H feel solid:

- Memory kernel
- Eval lab
- Scheduling
- Graph topology / multi-agent workflows
- Multi-runtime adapters
- LLM-based request routing (currently keyword + default only)

Smaller useful next steps:

- [x] Commit Steps B–H + handoff
- [x] `pnpm build` verification
- [x] Worker health / single-instance guard in dev
- [x] Filter approvals page to `?status=pending` by default
- [x] Show API error banner on all pages (currently Requests + Approvals)

---

## 11. Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Submit silent / no requests | Wrong API port (8787 = Kilroy) | Use 8797, restart web |
| Red API banner | Stack not running | `pnpm dev` |
| `Generate failed: HTTP 400` | Old tool naming bug (fixed) or cliproxy down | Pull latest `build-functions.ts`; check cliproxy |
| Run `failed` instantly | Multiple workers / DB seq race | Kill extra workers, retry |
| Approvals empty | No run reached risky tool | Start run; wait for `needs_approval` |
| Runs stay `queued` | Worker crashed | Check worker logs; `pnpm dev:worker` |
| Real mode slow | cliproxy + gemini reasoning tokens | Normal; smoke test can take minutes |

---

## 12. Manual test script (happy path)

```bash
# 1. Health
curl http://localhost:8797/health

# 2. Seed
curl -X POST http://localhost:8797/agents/seed-demo

# 3. Submit (auto-routed)
curl -X POST http://localhost:8797/requests \
  -H 'Content-Type: application/json' \
  -d '{"body":"Create a plan and use the fake risky tool for approval testing."}'

# 4. Start run (paste request id)
curl -X POST http://localhost:8797/runs \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"<REQUEST_ID>"}'

# 5. Poll run until needs_approval
curl http://localhost:8797/runs/<RUN_ID>

# 6. Approve
curl http://localhost:8797/approvals
curl -X POST http://localhost:8797/approvals/<APPROVAL_ID>/approve

# 7. Confirm completed
curl http://localhost:8797/runs/<RUN_ID>
```

---

## 13. Session summary for next agent

You inherit a **working MVP control plane** with mock + real Ax, host tools, agent editor, and request router. The main operational hazards on Ben's machine are **port conflicts** (8787 Kilroy, 3000 busy) and **stale multi-worker processes**. Code fixes for tool-name 400s and worker claiming are in place but the stack must be restarted cleanly.

Start here: read this file → `README.md` → confirm `8797/health` → `pnpm dev` → walk the happy path in §12.
