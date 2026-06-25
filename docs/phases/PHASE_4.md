# Phase 4 complete — Ax Runner Adapter MVP

Implemented:

- `packages/ax-adapter`.
- Mock Ax execution mode for local deterministic runs.
- Real Ax execution mode scaffold using `@ax-llm/ax`.
- Event emission for actor turns, tool calls, usage, chat log, traces, completion, failure.
- Worker integration.

Acceptance:

- Worker executes queued runs.
- Run events are persisted.
- Timeline shows Ax-shaped lifecycle events.
- Real Ax mode is available when provider key/config are supplied.
