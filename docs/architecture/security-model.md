# Security model

The MVP security boundary is host-side tool wrapping.

Rules:

1. The Ax runtime should not receive direct access to filesystem, network, shell, or secrets.
2. Every side-effecting tool is represented as a host-side function.
3. Host-side functions are wrapped by the policy engine before execution.
4. Policy decisions are persisted as events.
5. Risky tools create approval records before they execute.
6. Approving an action requeues the run.
7. Rejected actions fail the run safely.

This is not a hardened sandbox. Treat AxJSRuntime as defense-in-depth and keep privileged effects in host-side wrappers.
