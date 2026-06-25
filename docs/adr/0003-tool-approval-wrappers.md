# ADR 0003: Side-effecting tools require policy wrappers

## Decision

Tool enforcement lives in host-side wrappers, not merely in observation callbacks.

## Rationale

Callbacks are useful for visibility, but execution authority belongs to host-side tools. Tool wrappers are the last safe checkpoint before side effects happen.

## Consequence

Every risky tool must declare risk metadata and pass through `evaluatePolicy(...)` before running.
