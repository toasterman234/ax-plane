# ADR 0001: Control plane wraps Ax

## Decision

AxPlane wraps `@ax-llm/ax` instead of forking it or replacing it.

## Rationale

Ax already provides typed signatures, agents, RLM runtime execution, model provider abstractions, context policies, callbacks, traces, and usage metrics. AxPlane adds the missing operator layer: registry, run history, approvals, policy, and UI.

## Consequence

The control plane should depend on stable Ax callbacks and post-run accessors, not scraped prompts or internal private state.
