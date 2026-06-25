# Runtime adapters

AxPlane routes agent execution through `@axplane/runtime` instead of calling `@axplane/ax-adapter` directly from the worker or API.

## Flow

```txt
worker / API eval & lab
  → runAgentForConfig({ agentConfig, ... })
    → getRuntimeAdapter(agentConfig.runtime)
      → ax: @axplane/ax-adapter (mock + real)
      → pi: not wired (fails loud)
```

## Agent config

```yaml
runtime: ax   # default — uses @ax-llm/ax
runtime: pi   # reserved stub only — fails loud; pi integration is out of scope for AxPlane
```

## API

```ts
import { runAgentForConfig, getRuntimeAdapter } from '@axplane/runtime';
```

`runAgentForConfig` reads `agentConfig.runtime` and delegates. Graph workflows, eval runs, and Agent Lab optimization all use the same entry point.

## Adding a runtime

1. Implement `RuntimeAdapter` in `packages/runtime/src/`.
2. Register in `factory.ts` `adapters` map.
3. Add enum value to `AgentRuntimeSchema` in `@axplane/agents`.

## PI runtime (out of scope)

`piRuntimeAdapter` throws if `runtime: pi` is set. **AxPlane stays separate from the governed pi stack** (`~/Projects/pi`, ben-agents3). Do not plan MCP/subagent bridges through pi here.
