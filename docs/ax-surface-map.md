# Ax surface map (axllm.dev vs AxPlane)

> **Source of truth for Ax marketing surface:** [axllm.dev](https://axllm.dev) (“The full surface” + Agents / Audio / Optimization sections).  
> **Companion (ax-lab research):** `../../docs/ax-llm-comparison.md` in the ax-lab repo.  
> **Sync rule:** When AxPlane gains or drops a capability listed here, update this file **and** the matching rows in `HANDOFF.md` §2 / §12.

**Last reviewed:** 2026-06-25 (dispatcher proxy + governed axdispatcher runs).

---

## Framing

AxPlane is a **control plane around Ax**, not a reimplementation of axllm.dev. It wraps a **subset** of Ax runtime features and adds operations layers Ax does not advertise (requests, approvals, durable event log, dashboard, eval lab, graph child-runs).

**Pi is out of scope.** Governed pi (`~/Projects/pi`, ben-agents3) stays a separate runtime boundary — no `piRuntimeAdapter`, no pi MCP bridge in AxPlane.

---

## Summary

| AxPlane strength | Ax / site feature it relates to |
|------------------|----------------------------------|
| Run lifecycle, policy, SSE dashboard | Operational / “enterprise” themes on the site |
| Host tools + HTTP custom tools | Tools `fn()` (not MCP) |
| Graph child-run workflows | Site “Workflows” / multi-agent (different engine than `flow()`) |
| Governed axflow runs + flow canvas | Ax `flow()` via ax-server proxy (`runKind: axflow`), not in-process `forward()` |
| Governed dispatcher + team canvas | Ax `agent()` team RLM via ax-server `/dispatcher` (`runKind: axdispatcher`) |
| Eval lab + Agent Lab | Optimization + evals on the site |
| Memory kernel + `memory.*` tools | Agent memory (not `recall()`) |
| Request router (keyword / LLM) | Intent routing (not `AxBalancer`) |

---

## Full surface grid (axllm.dev)

| Site capability | In AxPlane | Notes |
|-----------------|------------|--------|
| **Structured generation `ax()`** | ✅ Partial | Real mode, `AXPLANE_REAL_STRATEGY=native` — `ax(signature, { functions })` + host tools |
| **Signatures `s()` + `f()`** | ⚠️ Partial | String `signature:` in agent YAML/editor only; no fluent `f().input().output()` builder |
| **Tools `fn()`** | ✅ | `repo.*`, `github.*`, `shell.run`, `fake.*`, `memory.*`, HTTP `custom_tools` |
| **MCP `AxMCPClient`** | ❌ | Not wired; see `docs/runtime-adapters.md` (pi out of scope) |
| **Agents `agent()`** | ✅ Partial | RLM path (`mode: rlm`); `contextFields`, `contextPolicy`, lab artifacts |
| **Minimal `agent()` (no JS runtime)** | ❌ | Native path is `ax()`, not minimal `agent()` |
| **Child agents in `functions: []`** | ❌ | Graph child runs + **dispatcher proxy** (`team.*` on ax-server); not in-process in AxPlane worker |
| **`discover()` / skills / `selectionCriteria`** | ❌ | No ax-native skill index |
| **`recall()` / ax memory hooks** | ❌ | Control-plane `memory_entries` kernel + tools instead |
| **Ax `flow()` / AxFlow** | ⚠️ Partial | Governed `runKind: axflow` proxies ax-sandbox `ax-server` (`:8810`); read-only canvas + overlays. Graph workflows remain child-run orchestration — not in-process `flow().forward()` |
| **`agent.optimize()`** | ✅ | Agent Lab `ax-native` optimizer |
| **Top-level `optimize()` / GEPA on `ax()`** | ❌ | No general program optimizer |
| **Audio** (transcribe, speak, `speech:audio`, realtime) | ❌ | Text-only `taskText` path |
| **Multimodal** (`image`, media types) | ❌ | |
| **Streaming structured output to client** | ❌ | Batch `forward()`; UI streams **run events** via SSE, not LLM tokens |
| **Validation / retry as product surface** | ❌ | Inside Ax; not configurable in AxPlane |
| **`AxBalancer` / multi-service routing** | ❌ | Per-agent `models.primary` / `fallback` config only |
| **Embeddings / context caching** | ❌ | |
| **OpenTelemetry from Ax** | ❌ | Events → Postgres; no OTel export pipeline |
| **AxIR / Python, Java, Go, Rust** | N/A | AxPlane is TypeScript control plane only |
| **Rate limits, sampling, redaction (Ax layer)** | ❌ | Tool policy on host tools only |
| **Agent skills (npx skills for Cursor)** | ⚠️ | Vendored under `.claude/skills/` for **coding** agents, not runtime |

Legend: ✅ shipped · ⚠️ partial / adjacent · ❌ not in AxPlane · N/A not applicable

---

## Agents section (axllm.dev/agents themes)

| Site agent feature | AxPlane |
|--------------------|---------|
| Function discovery (large catalogs) | ❌ Fixed tool list per agent config |
| Context maps / PEEK-style orientation | ⚠️ `contextPolicy` on RLM path; limited UI |
| MCP in `functions` | ❌ |
| Child agents as typed capabilities | ❌ → graph workflows + dispatcher proxy |
| Memory + skills + MCP in one agent | ❌ → memory kernel + host tools only |
| `agent.optimize()` | ✅ Agent Lab |

---

## Deliberate substitutes (not gaps)

| axllm.dev pattern | AxPlane choice |
|-------------------|----------------|
| `flow()` workflows | DB graph workflows + child runs (`docs/workflows.md`); **plus** governed axflow proxy (`docs/flow-canvas.md`) |
| In-process subagents | Parent/child runs (DECISIONS 0007) |
| MCP tools | Host tools + HTTP custom tools |
| pi orchestration | Out of scope — ben-agents3 / agent-runner |

---

## AxPlane-only (not on axllm.dev homepage)

| Capability | Status |
|------------|--------|
| Request inbox + routing | ✅ |
| Durable `run_events` + SSE | ✅ |
| Tool approval gates | ✅ |
| Agent registry + version history | ✅ |
| Eval lab (deterministic scoring) | ✅ |
| Agent Lab (compare, promote) | ✅ |
| Workflow builder UI (linear steps) | ✅ |
| `POST /workflows` upsert | ✅ |
| Scheduling (cron / delayed runs) | ❌ planned |
| Workflow delete / parallel / visual DAG | ❌ planned → `docs/workflows-roadmap.md` |
| Flow canvas (`@axplane/flow-canvas`) | ✅ |
| `/ax-flows` catalog + live SSE + governed queue | ✅ |
| `POST /runs` with `axFlowId` (`runKind: axflow`) | ✅ |
| `/dispatcher` + governed `runKind: axdispatcher` | ✅ |

---

## When to update this doc

Update **this file** and **`HANDOFF.md` §2** when any of these change:

- New Ax execution strategy in `@axplane/ax-adapter`
- Agent Lab / optimizer behavior
- Graph workflow model or executor
- Tool types (MCP, new host namespaces)
- Memory / routing / scheduling shipped
