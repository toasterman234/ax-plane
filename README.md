# Ax Plane

Local-first control plane around [`@ax-llm/ax`](https://github.com/ax-llm/ax). MIT licensed.

AxPlane is a local-first control plane around `@ax-llm/ax`. This MVP implements phases 0-5:

- repo scaffold and docs
- Postgres schema and event taxonomy
- Hono API
- Next.js dashboard
- worker process
- Ax runner adapter with mock and real-Ax execution modes
- tool policy and approval gates
- durable `run_events` timeline with SSE streaming

## What works in this MVP

1. Define one default Ax agent through YAML config.
2. Submit a request from the UI.
3. Start a run.
4. Worker executes the run.
5. Run events stream live into the run detail page.
6. Timeline shows actor turns, tool calls, usage, chat log, traces, final output.
7. Read-only host tools (`repo.*`, `docs.search`, `github.searchIssues`, etc.) run without approval.
8. Write/shell tools (`repo.writeFile`, `shell.run`, `github.create*`, `fake.riskyAction`) require approval.
9. Approving/rejecting persists a decision and resumes the run without a full rerun.
10. Everything is stored in Postgres.

## Execution modes

The default is deterministic local demo mode:

```bash
AXPLANE_EXECUTION_MODE=mock
```

This lets you test the dashboard, worker, event stream, and approval flow without a model key.

Real Ax mode calls `@ax-llm/ax` through the worker (default: native tool-calling, same pattern as ax-lab):

```bash
AXPLANE_EXECUTION_MODE=real
AXPLANE_REAL_STRATEGY=native   # recommended — ax() + native tools
AX_BASE_URL=http://127.0.0.1:8317/v1
AX_API_KEY=sk-cliproxy
AX_MODEL=gemini-3-flash
```

Or use direct OpenAI: set `OPENAI_API_KEY` and `AX_MODEL=gpt-4o-mini` (omit `AX_BASE_URL`).

Optional RLM pipeline (`agent()` + JS runtime): `AXPLANE_REAL_STRATEGY=rlm`

Real runs capture `getChatLog()`, `getUsage()`, `getStagedUsage()`, and `getTraces()` into the event log.

Smoke test:

```bash
AXPLANE_EXECUTION_MODE=real pnpm --filter @axplane/ax-adapter exec tsx scripts/smoke-real.ts
```

## Quick start

```bash
cd axplane
corepack enable
corepack prepare pnpm@9.15.4 --activate
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

If host port `5432` is already taken, this repo defaults Postgres to **`5433`** (see `docker-compose.yml` and `.env.example`).

Open:

- Web: http://localhost:3010 (default; ax-studio often owns 3000)
- API health: http://localhost:8797/health

**Note:** Port **8787** is often used by Kilroy on this machine. AxPlane defaults to **8797**.

Validate the stack:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected health response:

```json
{ "ok": true, "service": "axplane-api", "router": { "mode": "keyword", "executionMode": "mock" } }
```

## Host tools (Steps E/F)

All tools execute **host-side** in `@axplane/host-tools` — the worker never exposes raw filesystem or shell access to the model. Policy in `@axplane/policy` gates each call:

| Class | Tools | Policy |
|-------|-------|--------|
| Read-only | `repo.listFiles`, `repo.readFile`, `repo.search`, `docs.search`, `github.searchIssues`, `github.readIssue`, `github.readFile`, `fake.projectLookup` | allow |
| Write / side-effect | `repo.writeFile`, `shell.run`, `github.createIssue`, `github.createBranch`, `github.createPR`, `fake.riskyAction` | approval required |

Configure the sandbox:

```bash
AXPLANE_REPO_ROOT=/path/to/your/repo    # defaults to cwd
AXPLANE_DOCS_ROOT=/path/to/docs         # defaults to {repo}/docs
GITHUB_TOKEN=ghp_...                    # for github.* tools
GITHUB_REPO=owner/repo
```

Try read-only tools in mock or real mode: submit a request like `Read README.md with repo.readFile and summarize it`.

Write tools pause at `needs_approval` the same way as `fake.riskyAction`.

## Agent config editor (Phase 6)

Open **Agents → Edit config** (or `/agents/default_ax_agent`) to:

- Edit name, description, signature, mode, and context policy
- Enable/disable tools with risk badges (read-only vs approval-required)
- Toggle policies
- Save a **new version** (version history on the right)
- Preview or restore older versions

Runs pin the agent version at start time (`agent_version_id`), so edits do not affect in-flight runs.

API:

```txt
GET    /tools
GET    /agents/:id/versions
PATCH  /agents/:id
POST   /agents/:id/versions
```

## Request router (Phase 7 / Step H)

Submit a request without picking an agent — the router classifies it:

| Strategy | When |
|----------|------|
| `keyword` | Request body matches an agent's routing keywords |
| `default` | No keyword match → agent marked `routing.isDefault` |
| `llm` | Model classifier picks the best agent from the catalog |
| `explicit` | You force an agent on submit |
| `manual_override` | You change agent before starting a run |

Set `AXPLANE_ROUTER_MODE`:

| Mode | Behavior |
|------|----------|
| `keyword` | Legacy keyword + default routing (default) |
| `llm` | Always classify with LLM (mock heuristic when `AXPLANE_EXECUTION_MODE=mock`) |
| `hybrid` | Keywords first; if no match, LLM classifier |

```env
AXPLANE_ROUTER_MODE=hybrid
AX_ROUTER_MODEL=gemini-3-flash   # optional; defaults to AX_MODEL
```

Configure keywords per agent in **Agents → Edit config → Routing**.

```txt
POST /requests              # auto-route; optional agentId, autoStart
POST /requests/:id/route    # re-classify or override agent
POST /runs                  # agentId optional (uses routed agent)
```

## Try the approval flow

1. Open the web app.
2. Go to **Requests**.
3. Submit: `Draft a plan and call the risky tool`.
4. Click **Start run**.
5. Open the run detail page.
6. The worker will pause at `fake.riskyAction` and create an approval.
7. Go to **Approvals** and approve it.
8. The run is requeued, the worker completes it, and the timeline updates.

## Scripts

```bash
pnpm dev           # start API, worker, and web
pnpm dev:api       # API only
pnpm dev:worker    # worker only
pnpm dev:web       # web only
pnpm test          # package tests
pnpm typecheck     # workspace TypeScript check
pnpm build         # production build (includes Next.js)
pnpm db:generate   # generate Drizzle migrations
pnpm db:migrate    # run migrations
pnpm db:seed       # seed default agent/request
```

## Architecture

```txt
apps/web        -> Next.js dashboard
apps/api        -> Hono API + SSE stream
apps/worker     -> run polling; executes via @axplane/runtime

packages/db           -> Drizzle schema + repositories (migrations 0000–0005)
packages/events       -> normalized event taxonomy
packages/policy       -> allow/block/approval policy engine
packages/host-tools   -> repo, docs, github, shell, HTTP tools
packages/agents       -> agent config, routing, models, templates
packages/router       -> keyword + optional LLM request routing
packages/runtime      -> RuntimeAdapter facade (ax wired, pi stub)
packages/ax-adapter   -> mock + real Ax runner, agent.optimize path
packages/lab            -> Agent Lab workflow (optimize, compare, promote)
packages/forge          -> Agent Forge intake, scaffold, eval seed, workflow
packages/memory         -> kernel inject, memory.* tools
packages/eval           -> eval suites + deterministic scoring
packages/graph          -> control-plane child-run workflows
packages/runtime-dev    -> worker lock + heartbeat
```

The UI never calls Ax directly. The worker runs agents through `@axplane/runtime` → `@axplane/ax-adapter`, which emits normalized events into Postgres. The web app renders the event log.

## Notes

Still **not** implemented: **scheduling** (cron/delayed runs); workflow **delete**, parallel branches, conditional edges, visual DAG editor (see `docs/workflows-roadmap.md`). Agent Forge Phases 0–3 shipped; next optional work is Phase 4 (flows/GEPA) or Phase 5 (pi export brief).

**Out of scope:** governed pi runtime — AxPlane is Ax-only; pi stays in ben-agents3 / agent-runner.

Implemented since the original MVP scaffold: memory kernel, eval lab, graph workflows (builder + `POST /workflows`), Agent Lab, multi-runtime facade, LLM routing. See `HANDOFF.md` for the full status matrix; `docs/ax-surface-map.md` for axllm.dev coverage.

### Local validation status (2026-06-25)

Mock mode validated end-to-end via API:

- request → run → worker → durable `run_events`
- risky tool pauses at `needs_approval`
- approval → requeue → `completed`
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass

Real Ax mode validated via cliproxy (`AXPLANE_REAL_STRATEGY=native`):

- real LLM tool calls (`fake.projectLookup`, `fake.riskyAction`)
- approval gate pauses real runs correctly
- post-approval completion with captured usage + chat log

Known local gotchas:

- Postgres binds to host port **5433** when **5432** is already in use.
- SSE uses default `message` events (not named event types) so `EventSource.onmessage` works.
- If web fails with `EADDRINUSE` on port 3000, stop the other process or set `PORT=3010` (AxPlane default).
