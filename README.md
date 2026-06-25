# AxPlane MVP

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

1. Define one demo Ax agent through YAML config.
2. Submit a request from the UI.
3. Start a run.
4. Worker executes the run.
5. Run events stream live into the run detail page.
6. Timeline shows actor turns, tool calls, usage, chat log, traces, final output.
7. One fake risky tool requires approval.
8. Approving/rejecting persists a decision.
9. Everything is stored in Postgres.

## Execution modes

The default is deterministic local demo mode:

```bash
AXPLANE_EXECUTION_MODE=mock
```

This lets you test the dashboard, worker, event stream, and approval flow without a model key.

Real Ax mode is scaffolded through `@ax-llm/ax`:

```bash
AXPLANE_EXECUTION_MODE=real
OPENAI_API_KEY=...
AX_PROVIDER=openai
AX_MODEL=gpt-4o-mini
```

The real mode uses Ax's `agent(...)`, `ai(...)`, `AxJSRuntime`, `actorTurnCallback`, `onContextEvent`, `agentStatusCallback`, `onFunctionCall`, `getChatLog()`, `getUsage()`, `getStagedUsage()`, and `getTraces()` where available.

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

- Web: http://localhost:3000
- API health: http://localhost:8787/health

Validate the stack:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected health response:

```json
{ "ok": true, "service": "axplane-api" }
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
pnpm db:seed       # seed demo agent/request
```

## Architecture

```txt
apps/web     -> Next.js PWA dashboard
apps/api     -> Hono API + SSE stream
apps/worker  -> run polling and Ax execution
packages/db  -> Drizzle schema + repositories
packages/events -> normalized event taxonomy
packages/policy -> allow/block/approval policy engine
packages/agents -> demo agent config and tool descriptors
packages/ax-adapter -> mock + real Ax runner adapter
```

The UI never calls Ax directly. The worker runs agents through the Ax adapter, which emits normalized events into Postgres. The web app renders the event log.

## Notes

This is an MVP scaffold. It intentionally does **not** implement scheduling, graph topology, evals, memory, or multi-runtime support yet.

### Local validation status (2026-06-24)

Mock mode validated end-to-end via API:

- request → run → worker → durable `run_events`
- risky tool pauses at `needs_approval`
- approval → requeue → `completed`
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass

Known local gotchas:

- Postgres binds to host port **5433** when **5432** is already in use.
- SSE uses default `message` events (not named event types) so `EventSource.onmessage` works.
- If web fails with `EADDRINUSE` on port 3000, stop the other process or run `pnpm dev:web` on another port.
