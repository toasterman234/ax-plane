# Phase 1 complete — Database schema and event taxonomy

Implemented:

- Drizzle Postgres schema for agents, versions, requests, runs, run_events, tool_calls, approvals, usage, and artifacts.
- Normalized event taxonomy in `packages/events`.
- Append-only run event repository.
- Demo seed script.

Acceptance:

- `run_events` has monotonic per-run `seq`.
- Events are typed through Zod.
- Requests, runs, tool calls, and approvals are persisted.
