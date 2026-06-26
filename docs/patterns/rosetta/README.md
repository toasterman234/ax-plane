# Rosetta summaries (corpus → AxPlane)

Condensed operator/maintainer view of the six canonical patterns from [rawwerks/dynamic-agent-workflows](https://github.com/rawwerks/dynamic-agent-workflows). Full Executable Rosetta Entries live upstream under `spec/*.spec.md`.

| Pattern | Summary | Runnable in AxPlane |
|---------|---------|---------------------|
| [classify-and-act](./classify-and-act.md) | Classify → one handler or escalate | axflow `pattern-classify-and-act`; graph staging `pattern_classify_act_staging` |
| [fanout-and-synthesize](./fanout-and-synthesize.md) | Parallel branches → barrier → merge | axflow `pattern-fanout-and-synthesize` |
| [adversarial-verification](./adversarial-verification.md) | Produce → refute each → survivors | axflow `pattern-adversarial-verification` |
| [generate-and-filter](./generate-and-filter.md) | N generators → rubric → keep k | axflow `pattern-generate-and-filter` |
| [tournament](./tournament.md) | Pairwise bracket → champion | axflow `pattern-tournament` |
| [loop-until-done](./loop-until-done.md) | Loop until dry-streak fixpoint | axflow `pattern-loop-until-done` |

See also: [conformance.md](../conformance.md), [graph-reference.md](../graph-reference.md).
