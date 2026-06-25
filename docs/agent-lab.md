# Agent Lab

Agent Lab is the **eval → optimize → compare → promote** loop inside AxPlane. It builds on the existing Eval lab (`eval_suites`, `eval_runs`) and adds optimization candidates with explicit human promotion.

## Where to find it

Open any agent → **Agent Lab** tab:

```txt
http://localhost:3010/agents/demo_ax_agent
```

Global eval tools remain at `/eval`; Agent Lab is agent-scoped.

## Loop

```txt
Seed eval suite (per agent)
  → Run baseline eval
  → Optimize agent (mock or future real Ax)
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

## Real Ax optimization (future)

`optimizerType: ax-native` is reserved for wiring `agent.optimize()` from `@ax-llm/ax`. The API returns **501** until that adapter is implemented.

Planned flow:

```txt
eval tasks (input + criteria)
  → agent.optimize(...)
  → axSerializeOptimizedProgram artifact
  → candidate eval
  → human promote → agent_versions
```

DSPy remains a future sidecar (`dspy-sidecar` optimizer type) — not part of v1.

## API

```txt
GET  /agents/:id/lab/suites
POST /agents/:id/lab/suites/seed-demo
POST /agents/:id/lab/baseline-eval     { suiteId, mode }
POST /agents/:id/lab/optimize          { suiteId, mode, optimizerType }
GET  /agents/:id/lab/optimization-runs
GET  /agents/:id/lab/candidates
GET  /agents/:id/lab/comparison?baselineEvalRunId=&candidateEvalRunId=
POST /agents/:id/lab/candidates/:candidateId/promote
POST /agents/:id/lab/candidates/:candidateId/reject
```

## Data model (delta)

| Table | Purpose |
|-------|---------|
| `eval_suites.agent_id` | Optional link to an agent |
| `eval_runs.run_label` | `baseline` or `candidate` |
| `eval_runs.candidate_id` | Links candidate eval runs |
| `optimization_runs` | One optimize attempt |
| `agent_candidates` | Stored artifact until promote/reject |

## Example workflow

```bash
cd ~/Projects/ax-lab/axplane
pnpm db:migrate
pnpm dev
```

1. Open **Agents → demo_ax_agent → Agent Lab**
2. **Seed demo suite**
3. **Run baseline** (mock mode)
4. **Optimize agent**
5. Review comparison and candidate artifact
6. **Promote** or **Reject**

## Known limitations

- Eval runs synchronously in the API (not worker-queued).
- Mock optimizer does not change mock-run tool behavior — scores may be identical; the loop and artifacts still work.
- No eval task CRUD UI yet (seed + global `/eval` API).
- Real `agent.optimize()` not wired.
- Comparison cost/turn metrics depend on run events and `model_usage` rows being populated.

## Package map

```txt
packages/lab       mock optimizer, comparison, optimization workflow
packages/eval      eval runner (extended for candidate config override)
packages/db        migrations 0005_agent_lab.sql
apps/api           lab endpoints
apps/web           Agent Lab tab
```
