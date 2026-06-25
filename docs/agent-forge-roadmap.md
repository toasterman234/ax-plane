# Agent Forge roadmap

> **Product brief:** `docs/agent-forge.md`  
> **Downstream:** `docs/agent-lab.md` (optimize / compare / promote)  
> **Checkpoint:** 2026-06-25 — **v1 + Phase 3 shipped** (Phases 0–3). Heuristic + LLM scaffold paths; unit tests 23/23.

**Sync rule:** When a phase ships, update this file, `docs/agent-forge.md`, `HANDOFF.md` §2 + §12, and `docs/ax-surface-map.md`.

---

## Current state

| Item | Status |
|------|--------|
| Agent editor + `buildStarterAgentConfig` | ✅ reuse |
| Eval lab + per-agent Agent Lab | ✅ reuse |
| `executeOptimizationWorkflow` (`packages/lab`) | ✅ reuse |
| `agent.optimize()` via `optimizeAxAgent` | ✅ reuse (RLM + real only) |
| Conversational intake → scaffold → seed eval → one workflow | ✅ v1 — `packages/forge` + DB + API + UI |
| `forge_sessions` table / API | ✅ (`packages/forge`, `/forge/sessions/*`) |
| Forge UI | ✅ `/agents/forge` wizard (`/forge` redirects) |
| LLM-assisted scaffold (`?strategy=llm`) | ✅ Phase 3 — mock + real with heuristic fallback |

---

## Design principles

1. **No new optimizer core** — Forge orchestrates; Agent Lab optimizes.
2. **Eval is load-bearing** — intake must define success/failure or generated cases are useless.
3. **Explicit promotion** — same rule as Agent Lab: never silently overwrite `agent_versions`.
4. **Mock-first** — full chain must work in `AXPLANE_EXECUTION_MODE=mock` without keys.
5. **Ax-only artifacts** — Postgres agent config + eval suite; not pi `agent.md`.

---

## Architecture

```txt
apps/web (/agents/forge — /forge redirects)
    ↓
apps/api (/forge/sessions/*)
    ↓
packages/forge
    ├─ intake schema (Zod)
    ├─ scaffoldAgentConfig(intake) → AgentConfig draft
    ├─ seedEvalCases(intake) → EvalCase[]
    └─ executeForgeWorkflow(repo, sessionId)
           ├─ packages/agents  (create agent + version)
           ├─ packages/eval    (create suite + cases)
           └─ packages/lab     (baseline + optional optimize)
```

---

## Phase 0 — Package + schema (1–2 days)

**Goal:** Durable session state; no UI.

**Migration `0006_forge_sessions.sql` (sketch):**

```sql
CREATE TABLE forge_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status        text NOT NULL DEFAULT 'intake',  -- intake | scaffolded | committed | optimizing | done | failed
  intake_json   jsonb NOT NULL DEFAULT '{}',
  draft_json    jsonb,                           -- { agentConfig, evalCases }
  agent_id      text REFERENCES agents(id),
  suite_id      uuid REFERENCES eval_suites(id),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

**Package:** `packages/forge`

| Module | Responsibility |
|--------|----------------|
| `intake-schema.ts` | Zod schema for intake answers |
| `scaffold.ts` | `scaffoldAgentConfig(intake)` using `buildStarterAgentConfig` + tool selection heuristics |
| `eval-seed.ts` | `seedEvalCases(intake)` → 3–8 cases with criteria |
| `workflow.ts` | `commitForgeSession`, `runForgeBaseline`, `runForgeOptimize` |

**Scaffold heuristics (v1 — deterministic, no LLM required for mock path):**

- Map tool intents → `STARTER_READ_ONLY_TOOLS` subset or write tools + `write_tool_requires_approval`
- Default `mode: normal` for mock; suggest `mode: rlm` when optimize requested
- Signature template: `taskText:string "…" -> answer:string, nextActions:string[]` unless intake specifies structured outputs
- Routing keywords from intake task nouns (simple token extract) or empty

**Eval seed heuristics (v1):**

- Case 1: intake success example as `taskText` + criteria from success description
- Case 2: adversarial / must-not-fail from intake failure question
- Cases 3–N: variations on task phrasing (template expansion)
- Criteria types: reuse existing `EvalCriterion` shapes from `packages/eval`

**Tests:** unit tests for scaffold + eval-seed from fixture intake JSON.

---

## Phase 1 — API (1 day) ✅

**Routes:**

```txt
POST   /forge/sessions
       body: { intake?: Partial<Intake> }
       → { session }

PATCH  /forge/sessions/:id
       body: { intake: Partial<Intake> }
       → { session }

POST   /forge/sessions/:id/scaffold
       → { session, draft: { agentConfig, evalCases } }

POST   /forge/sessions/:id/commit
       body: { agentId?, name?, runBaseline?: boolean }
       → creates agents row + agent_versions + eval_suite + cases
       → optional baseline via packages/eval
       → { session, agentId, suiteId, baselineEvalRunId? }

POST   /forge/sessions/:id/optimize
       body: { optimizerType?: 'ax-native-mock' | 'ax-native', optimizerConfig? }
       → delegates to executeOptimizationWorkflow
       → { session, optimizationRunId, candidateId? }

GET    /forge/sessions/:id
       → session + links

GET    /forge/sessions
       → list recent sessions (limit 50)
```

**Repo methods:** `packages/db` — `createForgeSession`, `updateForgeSession`, `getForgeSession`, `listForgeSessions`.

**Error cases:**

- `commit` without `scaffold` → 400
- `optimize` with `mode: normal` + `ax-native` → 400 with message to use mock or switch agent to `rlm`
- Duplicate `agentId` on commit → 409

---

## Phase 2 — UI (1–2 days) ✅

**Entry points:**

- Agents hub tab: **Forge** → `/agents/forge`
- Legacy redirect: `/forge` → `/agents/forge`
- Agents registry: **New via Forge** button

**Wizard steps:**

1. **Intake** — form mirroring intake schema (6 core questions)
2. **Review draft** — editable JSON or simplified fields (signature, tools checklist, eval case list)
3. **Commit** — name + agent id slug; checkbox “Run baseline”
4. **Results** — link to agent editor, Agent Lab tab, comparison if optimize ran

**Mock mode banner** when `AXPLANE_EXECUTION_MODE=mock` — explain optimize is mock-only.

Reuse existing UI patterns from `agent-editor.tsx`, `agent-lab.tsx`.

---

## Phase 3 — LLM-assisted scaffold ✅

**Goal:** Improve draft quality when real keys available; keep Phase 0 heuristics as fallback.

**Shipped:**

- `POST /forge/sessions/:id/scaffold?strategy=llm` (body: `{ strategy, mode }`) — single `ax()` generation with structured `scaffoldJson` output
- Mock path (`mode: mock`) works without API keys via `mockLlmScaffoldDraft`
- Real path (`mode: real`) uses `AX_API_KEY` / `OPENAI_API_KEY`; env `AX_FORGE_MODEL` optional
- Guardrails: host-tool allowlist, `LlmScaffoldOutputSchema` + `AgentConfigSchema`; heuristic fallback on parse/API failure
- Audit: `forge_sessions.draft_meta_json` stores strategy, mode, prompt, raw output, fallback reason
- UI: **Scaffold strategy** selector on intake step (`/agents/forge`)

**Module:** `packages/forge/src/llm-scaffold.ts`

---

## Phase 4 — Programs & flows (future)

**Goal:** Extend Forge to non-agent Ax programs — aligns with ax-forge compile ambition and `docs/ax-surface-map.md` gap (“Top-level `optimize()` / GEPA”).

| Target | Mechanism | Prerequisite |
|--------|-----------|--------------|
| `ax()` signature module | Top-level `optimize()` / GEPA on generator | Wire GEPA in `@axplane/ax-adapter` |
| `flow()` DAG | ax-server flow spec + optimize tree | Governed axflow proxy exists; optimizer not wired |
| Graph workflow | Scaffold linear `graph_workflows.steps` | `docs/workflows-roadmap.md` model stable |

**Explicitly defer** until Agent Forge v1 (agents) is stable and Agent Lab GEPA path is proven in adapter.

---

## Phase 5 — ben-agents3 bridge (optional, out of band)

Export intake summary as **read-only markdown** for pi operators — not live sync.

- `GET /forge/sessions/:id/export/pi-brief` → prose brief for `agno-agent-builder` or manual `agent.md` authoring
- No automatic write to `config/agents/` in ben-agents3

Keeps runtime boundaries clean per ADR 0001 and HANDOFF pi-out-of-scope rule.

---

## Effort summary

| Phase | Effort | Ships |
|-------|--------|--------|
| 0 — schema + package | 1–2 days | `packages/forge`, migration, unit tests |
| 1 — API | 1 day | `/forge/sessions/*` |
| 2 — UI | 1–2 days | `/agents/forge` wizard |
| 3 — LLM scaffold | 2–3 days | `?strategy=llm`, `draft_meta_json`, UI selector ✅ |
| 4 — flows / GEPA | TBD | separate epic |
| 5 — pi export brief | 0.5 day | optional |

**Minimum viable Forge:** Phases 0 + 1 + 2 (~4–5 days).

---

## Acceptance criteria (v1)

1. Mock mode: intake → commit → agent + suite exist in DB → baseline eval completes. ✅ smoke 2026-06-25
2. Mock optimize: full Forge session → mock candidate → promote in Agent Lab (manual). ✅ smoke 2026-06-25
3. Real mode (RLM agent): same path with `ax-native` optimize when keys present. (not smoke-tested)
4. No silent overwrites; all failures surface on session `status: failed` + `error`. ✅
5. `pnpm test` + `pnpm typecheck` green; Forge package has ≥10 unit tests on scaffold/eval-seed. ✅

---

## Smoke script (when shipped)

```bash
# Start session
SESSION=$(curl -sf -X POST http://localhost:8797/forge/sessions \
  -H 'Content-Type: application/json' \
  -d '{"intake":{"task":"Summarize repo docs for operators","success":"Short bullet summary with file paths","failure":"Must not run shell or write files","tools":["read"]}}')
SID=$(echo "$SESSION" | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])")
AGENT_ID="forge_smoke_$(date +%s)"   # unique — commit returns 409 if agent id exists

# Scaffold + commit
curl -sf -X POST "http://localhost:8797/forge/sessions/$SID/scaffold"
curl -sf -X POST "http://localhost:8797/forge/sessions/$SID/commit" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Forge Smoke Agent\",\"agentId\":\"$AGENT_ID\",\"runBaseline\":true}"

# Optional optimize (mock)
curl -sf -X POST "http://localhost:8797/forge/sessions/$SID/optimize" \
  -H 'Content-Type: application/json' \
  -d '{"optimizerType":"ax-native-mock"}'

# LLM scaffold (mock — no keys)
curl -sf -X POST "http://localhost:8797/forge/sessions/$SID/scaffold?strategy=llm" \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"llm","mode":"mock"}'
```

---

## Related files (existing — reuse, do not fork)

| Area | Path |
|------|------|
| Starter agent template | `packages/agents/src/templates.ts` |
| Agent Lab workflow | `packages/lab/src/workflow.ts` |
| Ax optimize | `packages/ax-adapter/src/optimize-agent.ts` |
| Eval runner | `packages/eval/src/` |
| Agent Lab UI | `apps/web/app/agents/[id]/agent-lab.tsx` |
| Agent Lab API | `apps/api/src/server.ts` (`/agents/:id/lab/*`) |
