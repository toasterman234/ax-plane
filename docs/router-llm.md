# LLM request routing

AxPlane can route incoming requests with a small Ax classifier in addition to keyword/default routing.

## Modes (`AXPLANE_ROUTER_MODE`)

| Mode | Behavior |
|------|----------|
| `keyword` | Existing behavior only (default) |
| `llm` | Always run the classifier (after explicit agent override) |
| `hybrid` | Keywords first; if no keyword match, run the classifier |

## Mock vs real

Routing follows `AXPLANE_EXECUTION_MODE`:

- **mock** — deterministic mock classifier (no API key). Useful for UI/dev.
- **real** — `ax()` classifier call via cliproxy / provider key.

`GET /health` includes `router.mode` and `router.executionMode`.

## Classifier

The LLM sees:

- `requestBody` — operator request text
- `agentCatalog` — JSON list of `{ id, name, description, keywords }`

It returns `{ agentId, reason, confidence }`. Unknown ids fail loud.

## Configuration

```env
AXPLANE_ROUTER_MODE=hybrid
AXPLANE_EXECUTION_MODE=real
AX_API_KEY=sk-cliproxy
AX_BASE_URL=http://127.0.0.1:8317/v1
AX_MODEL=gemini-3-flash
AX_ROUTER_MODEL=gemini-3-flash   # optional override
AX_ROUTER_TEMPERATURE=0
```

## API

Unchanged endpoints — routing is automatic on:

```txt
POST /requests
POST /requests/:id/route
```

`routeDecision.strategy` will be `llm` when the classifier picked the agent.
