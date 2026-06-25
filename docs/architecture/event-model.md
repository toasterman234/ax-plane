# Event model

Every run has an append-only event stream in `run_events`.

Events are normalized so the UI does not need to know Ax internals directly.

Important event classes:

- `request.*`
- `run.*`
- `ax.actor_turn`
- `ax.context_event`
- `ax.function_call.*`
- `ax.chat_log.captured`
- `ax.usage.captured`
- `ax.traces.captured`
- `approval.*`

`run_events.seq` is monotonic per run and is used by SSE clients to resume or poll safely.
