# ADR 0002: Event-sourced run log

## Decision

Store a durable append-only `run_events` timeline for each run.

## Rationale

A run needs to be replayable, streamable, auditable, and debuggable. Append-only events also make it easy to add new UI views without changing the worker.

## Consequence

Each event has a normalized type, JSON payload, and monotonic `seq` per run.
