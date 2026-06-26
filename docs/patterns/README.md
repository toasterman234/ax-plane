# Dynamic agent workflow patterns

AxPlane surfaces **ax-server** `flow()` and imperative pattern flows on **Workflows → AX Flows**. Six canonical topologies come from the [dynamic-agent-workflows](https://github.com/rawwerks/dynamic-agent-workflows) corpus (ported in ax-sandbox as `pattern-*` ids).

## When to use which AxPlane lane

| Topology need | AxPlane surface |
|---------------|-----------------|
| Fixed multi-step DAG (`flow()` or corpus pattern) | **AX Flows** — governed `runKind: axflow` |
| Sequential specialists with per-step audit trail | **Graph** — child runs (`/workflows`) |
| Open-ended team delegation | **Dispatcher** — `runKind: axdispatcher` |

## The six patterns

| Pattern | What it does |
|---------|----------------|
| **classify-and-act** | Classify → route to one handler (or escalate) |
| **fanout-and-synthesize** | Parallel branches → barrier → single merge |
| **adversarial-verification** | Produce → refute each item → keep survivors |
| **generate-and-filter** | N generators → rubric → keep top-k |
| **tournament** | Pairwise judged bracket → one winner |
| **loop-until-done** | Loop until dry-streak fixpoint (+ max rounds) |

Corpus flows register on ax-server as `pattern-<name>` (e.g. `pattern-fanout-and-synthesize`). Legacy flows may carry an informal `pattern` tag without being corpus ports (`patternSource: custom`) — e.g. `idea-council-flow` → fanout-and-synthesize.

**Docs:** [rosetta/](./rosetta/) · [conformance.md](./conformance.md) · [graph-reference.md](./graph-reference.md)

## Running from AxPlane

1. **Operations → Requests** — create a request with your task text.
2. **Workflows → AX Flows** — filter **Patterns** if needed; select a flow.
3. Paste input (see ax-sandbox `agents/patterns/README.md` for JSON shapes).
4. **Queue governed run** — worker proxies ax-server; timeline + canvas on run detail.

## References

- ax-sandbox pattern registry: `~/Projects/ax-sandbox/agents/patterns/`
- AxPlane issue tracker: [toasterman234/ax-plane#1](https://github.com/toasterman234/ax-plane/issues/1)
