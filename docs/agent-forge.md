# Agent Forge

> **Status:** ✅ v1 + Phase 3 shipped — heuristic + LLM scaffold (`?strategy=llm`), `draft_meta_json` audit trail. Phase 4+ → `docs/agent-forge-roadmap.md`  
> **Checkpoint:** 2026-06-25 — Phases 0–3 shipped; 23 unit tests in `@axplane/forge`.  
> **Sync rule:** New SQL under `packages/db/drizzle/` must be registered in `drizzle/meta/_journal.json` or `pnpm db:migrate` will skip it.

---

## What this is

**Agent Forge** is the guided **intake → scaffold → eval → optimize → promote** flow inside AxPlane.

Today those steps exist as **separate surfaces**:

| Step | Exists today | Where |
|------|----------------|-------|
| Conversational intake / “what should this agent do?” | ✅ | **Agent Forge** `/agents/forge` |
| Scaffold agent config (signature, tools, mode) | ✅ | Forge scaffold + agent editor |
| Seed eval suite from intent | ✅ | Forge `seedEvalCases` → eval suite on commit |
| Baseline eval | ✅ | Forge commit + Agent Lab `POST …/lab/baseline-eval` |
| Optimize | ✅ | Forge results step + Agent Lab `POST …/lab/optimize` |
| Compare + promote | ✅ | Agent Lab candidates + `promote` → `agent_versions` |

Forge **does not add a new optimizer**. It chains existing control-plane primitives behind one operator UX and one API workflow.

```txt
Intake (chat or structured form)
  → Scaffold AgentConfig draft
  → Seed eval_suite + cases (from interview answers)
  → Create agent + suite in DB
  → Baseline eval (packages/lab)
  → Optional optimize (packages/lab)
  → Compare + promote (existing Agent Lab)
```

---

## Why AxPlane (not ben-agents3 / Python DSPy)

| Layer | Home | Artifact |
|-------|------|----------|
| **Ax agents** (signatures, RLM, `agent.optimize()`) | AxPlane | `agent_versions` + `lab.optimizedProgram` |
| **pi agents** (`config/agents/*/agent.md`) | ben-agents3 + agent-runner | YAML proposals |
| **Python DSPy programs** | Sidecar projects / skills | `.json` program artifacts |

Forge targets **AxPlane agent configs** and eval suites. Mental model matches DSPy (typed I/O, metric, compile loop) but runtime is **`@ax-llm/ax`**, not a new Python DSPy service.

**Pi is out of scope** per `HANDOFF.md` and `docs/runtime-adapters.md`. Do not wire `piRuntimeAdapter` or emit pi `agent.md` from Forge v1.

---

## Relationship to Agent Lab

| | Agent Lab | Agent Forge |
|---|-----------|-------------|
| **Starts with** | Existing agent + (optional) seeded suite | Blank or rough intent |
| **Ends with** | Promoted optimized candidate | Same — hands off to Agent Lab for optimize/compare/promote |
| **New code** | Already shipped (`packages/lab`) | Intake + scaffold + eval seeding + orchestration API/UI |

After Forge creates an agent and suite, the **Agent Lab tab** remains the place to re-run baseline, optimize, and promote. Forge may deep-link there on completion.

---

## Relationship to legacy ax-forge

ben-agents2 **ax-forge** compiled JSON/YAML specs into Ax runtime (`signatureCompiler`, `flowCompiler`, `programCompiler`). AxPlane superseded it as the control plane.

Forge v1 **reuses AxPlane patterns** (Postgres registry, eval, Agent Lab) rather than reviving the old forge dashboard. Flow-level GEPA (v2) aligns with ax-forge’s compile ambition but uses Ax’s top-level `optimize()` when wired — see roadmap Phase 4.

---

## v1 scope (agents only)

**In scope**

- Structured intake (required questions + optional free text)
- Draft `AgentConfig`: heuristic (`strategy=heuristic`, default) or **LLM-assisted** (`strategy=llm`, mock or real)
- Auto-generated `eval_suites` + 3–8 cases with `taskText` + `criteria` derived from intake
- `POST /forge/sessions` workflow ending in created agent id + suite id
- UI: **Agents → Forge** (`/agents/forge`; `/forge` redirects)
- Mock-mode path (no API keys) through full chain
- Real optimize when `mode: rlm` + `AXPLANE_EXECUTION_MODE=real`

**Out of scope (v1)**

- Top-level GEPA on `ax()` signatures or `flow()` DAGs → roadmap Phase 4
- Graph workflow scaffolding
- pi `agent.md` export
- MCP / `discover()` / in-process child agents
- Replacing Agent Lab UI — Forge orchestrates into it

---

## Intake contract (sketch)

Forge intake must produce enough signal for **both** scaffold and eval seeding. Minimum questions (aligned with ben-agents3 `agno-eval-design` interview):

1. **Task** — What should the agent do in one sentence?
2. **Success** — What does a good answer look like? (concrete example welcome)
3. **Failure** — Worst acceptable failure / must-not-do?
4. **Tools** — Read-only repo/docs? Writes? Shell? External HTTP? (maps to host tool catalog)
5. **Judgment vs exact match** — Rubric scoring vs deterministic criteria?
6. **Volume** — One-off vs high-volume (informs model tier in scaffold)

Optional: routing keywords, memory inject, approval-sensitive tools.

---

## Package map

```txt
packages/forge       intake schema, heuristic + LLM scaffold, eval-case generator, session workflow (Phase 0–3 ✅)
packages/agents      buildStarterAgentConfig, tool catalog (reuse)
packages/eval        suite/case creation, executeEvalRun (reuse)
packages/lab         executeOptimizationWorkflow (reuse)
packages/db          migrations 0006_forge_sessions + 0007_forge_draft_meta, forge session repos
apps/api             /forge/sessions/* routes (Phase 1 ✅)
apps/web             `/agents/forge` wizard (Phase 2 ✅; `/forge` redirects)
```

---

## API (shipped)

See `docs/agent-forge-roadmap.md` for phase breakdown and smoke script.

```txt
POST   /forge/sessions              # start intake; returns sessionId
PATCH  /forge/sessions/:id          # merge intake answers
POST   /forge/sessions/:id/scaffold # draft AgentConfig + eval cases; ?strategy=heuristic|llm, body mode mock|real
POST   /forge/sessions/:id/commit   # create agent + suite; optional baseline
POST   /forge/sessions/:id/optimize # delegate to lab workflow (rlm + real only)
GET    /forge/sessions/:id          # status + links (agentId, suiteId, lab URL)
```

---

## Operator checklist

1. Open **Agents → Forge** (`/agents/forge`) → answer intake questions
2. Review scaffolded signature, tools, and eval cases → edit if needed
3. **Commit** → agent appears in **Agents** list
4. Review baseline scores
5. **Optimize** (optional; requires `mode: rlm` + real keys for `ax-native`)
6. **Agent Lab** → compare → promote

---

## Documentation index

| Doc | Purpose |
|-----|---------|
| `docs/agent-forge.md` | Product brief (this file) |
| `docs/agent-forge-roadmap.md` | Phased implementation plan |
| `docs/agent-lab.md` | Optimize / compare / promote (downstream) |
| `docs/ax-surface-map.md` | Capability grid |
