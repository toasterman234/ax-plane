# Phase 5 complete — Tool policy and approval gates

Implemented:

- `packages/policy`.
- Default allow policy.
- Secret-pattern block policy.
- Approval-required policy for `fake.riskyAction`.
- Host-side guarded fake tool execution.
- Approval records and events.
- Approve/reject UI and API.
- Requeue-after-approval behavior.

Acceptance:

- Safe fake lookup executes.
- Risky fake action creates approval before execution.
- Approval decision is persisted.
- Approved run is requeued and can complete.
- Rejected run fails safely.
