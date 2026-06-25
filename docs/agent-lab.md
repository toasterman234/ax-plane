# Agent Lab

Agent Lab is the **eval → optimize → compare → promote** loop inside AxPlane. It builds on the existing Eval lab (`eval_suites`, `eval_runs`) and adds optimization candidates with explicit human promotion.

## Where to find it

Open any agent → **Agent Lab** tab:

```txt
http://localhost:3010/agents/default_ax_agent
```

Global eval tools remain at `/eval`; Agent Lab is agent-scoped.

## Loop

```txt
Seed eval suite (per agent)
  → Run baseline eval
  → Optimize agent (mock or ax-native)
  → Compare baseline vs candidate
  → Promote or reject candidate
```

Promotion creates a **new `agent_versions` row** — the base agent is never silently overwritten.

## Mock mode (no API keys)

Default optimizer: `ax-native-mock`

1. Runs baseline eval against the current agent version.
2. Produces a deterministic candidate artifact (tweaked description, lean context policy, lower memory inject limit).
3. Re-runs the same eval suite against the candidate config.
4. Stores scores and comparison metrics.

Mock optimization is intentionally boring: it proves the control-plane loop without requiring `agent.optimize()`.

## Real Ax optimization (`ax-native`)

When `optimizerType` is `ax-native` and `mode` is `real`:

1. Converts eval suite cases into `agent.optimize()` tasks (`input` + `criteria` + optional `expectedActions`).
2. Builds an eval-safe in-memory tool stub layer (no host side effects during tuning).
3. Runs `agent.optimize()` with bounded `maxMetricCalls` (default **12**, override via `AXPLANE_OPTIMIZE_MAX_METRIC_CALLS` or API `optimizerConfig`).
4. Stores `axSerializeOptimizedProgram` output on the candidate config under `lab.optimizedProgram`.
5. Candidate eval runs apply the artifact via `applyOptimization()` on the RLM `agent()` path.

Requirements:

- Agent `mode` must be **`rlm`** (agent pipeline).
- `AXPLANE_EXECUTION_MODE=real` with a model key.

## API (agent-scoped)

```txt
GET    /agents/:id/lab/suites
POST   /agents/:id/lab/suites/seed-smoke
POST   /agents/:id/lab/baseline-eval
POST   /agents/:id/lab/optimize
GET    /agents/:id/lab/optimization-runs
GET    /agents/:id/lab/candidates
GET    /agents/:id/lab/comparison
POST   /agents/:id/lab/candidates/:candidateId/promote
POST   /agents/:id/lab/candidates/:candidateId/reject
```

`POST …/seed-demo` remains as a deprecated alias for `seed-smoke`.

## Example workflow

1. Open **Agents → default_ax_agent → Agent Lab**
2. **Install smoke suite**
3. **Run baseline** (mock mode)
4. **Optimize agent** (mock optimizer)
5. Review comparison and candidate artifact
6. **Promote** or **Reject**

## Known limitations

- Eval runs synchronously in the API (not worker-queued).
- Mock optimizer does not change mock-run tool behavior — scores may be identical; the loop and artifacts still work.
- No eval task CRUD UI yet (seed + global `/eval` API).
- `ax-native` requires agent `mode: rlm` and real execution mode with API key.
- Comparison cost/turn metrics depend on run events and `model_usage` rows being populated.

## Package map

```txt
packages/lab          optimization workflow + comparison
packages/eval         eval runner (candidate config override)
packages/ax-adapter   optimizeAxAgent, applyLabArtifactIfPresent
packages/db        migrations 0005_agent_lab.sql
apps/api           lab endpoints
apps/web           Agent Lab tab
```
