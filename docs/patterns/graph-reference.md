# Graph lane vs axflow for patterns

## Canonical runnable today

| Pattern | Use this |
|---------|----------|
| All six corpus patterns | **AX Flows** → `pattern-*` on ax-server |

Graph workflows remain **child-run orchestration** with per-step approvals and audit trail. They do not run in-process `flow().forward()`.

## Classify-And-Act reference

### Shipped: linear staging (`pattern_classify_act_staging`)

Install: **Workflows → Graph → Install classify staging** (or `POST /workflows/seed-pattern-classify`).

```txt
classify (child run) → act (child run)
```

- `pattern: classify-and-act` on the workflow row
- `definition_json` stores the **target v2 DAG** (`CLASSIFY_AND_ACT_GRAPH_V2`)
- Executor still runs v1 `steps[]` only

### Target v2 DAG (design-time)

Defined in `@axplane/graph` as `CLASSIFY_AND_ACT_GRAPH_V2`:

```txt
classify → router → { bug | feature | question | escalate } → end
```

**Blocked by:** graph roadmap Phase 4 (conditional edges on router output).

Until Phase 4 ships, operators who need true 1→N routing should use **pattern-classify-and-act** on the AX Flows tab.

## Pattern → graph roadmap mapping

| Pattern | Graph phase needed | Notes |
|---------|-------------------|--------|
| classify-and-act | Phase 4 (conditions) | v2 DAG checked in; staging linear workflow shipped |
| fanout-and-synthesize | Phase 3 (parallel + join) | Diamond A→B,C→D→join |
| adversarial-verification | Phase 3 + 4 | Per-finding parallel refuters + join gate |
| generate-and-filter | Phase 3 | Parallel gens + single filter child |
| tournament | Phase 3 + multi-round | Hard; axflow canonical |
| loop-until-done | Phase 2+ loop executor | Subgraph re-entry; axflow canonical |

See [workflows-roadmap.md](../workflows-roadmap.md) § Pattern-driven requirements.
