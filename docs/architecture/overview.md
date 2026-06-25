# AxPlane architecture

AxPlane wraps Ax rather than replacing it.

Ax owns:

- typed signatures
- agent runtime
- RLM distiller/executor/responder loop
- runtime tool calls
- provider abstraction
- usage/traces/chat logs

AxPlane owns:

- agent registry
- request inbox
- run queue
- durable run event log
- tool approval gates
- policy decisions
- live UI streaming
- replayable timelines

The frontend never imports or invokes `@ax-llm/ax`. The worker is the only process that executes agents.
