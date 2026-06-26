---
# Remixed from githubnext/agentics/workflows/repo-status.md
# CentralRepoOps customization: adds a governance-baseline check against the
# standards this org expects. Deploy into each managed repo with `gh aw deploy`.
description: |
  Daily repo status + governance baseline report. Gathers recent repository
  activity and checks the repo against the CentralRepoOps standards baseline
  (required files, labels, branch-protection expectations), then files a single
  GitHub issue with findings and recommended follow-ups.

on:
  schedule: daily
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

# Runs on our self-hosted zimaos DinD runner so the engine can reach the litellm gateway over
# tailscale. (Personal-account repos have no shared runner groups, so each
# managed repo that runs this needs access to a `lap`-labelled runner.)
runs-on: [self-hosted, lap]
runs-on-slim: self-hosted

# the litellm gateway needs the tailscale Mac IP added to the default egress allowlist.
network:
  allowed:
    - defaults
    - 100.71.118.10
    - 192.168.1.121

# The zimaos runner user has Docker but no passwordless sudo, so the AWF agent
# firewall (which needs sudo) cannot run. The MCP gateway guard stays ON.
strict: false
sandbox:
  agent: false
features:
  dangerously-disable-sandbox-agent: "runs on our own zimaos lap runner (no passwordless sudo for AWF); model traffic goes only to our litellm gateway over tailscale"

# BYOK: route the model through the litellm gateway (no Copilot AI, no model spend — the litellm gateway forwards
# to cliproxy/zimaos over our subscription). copilot is only the harness CLI.
engine:
  id: copilot
  model: claude-sonnet-4-6
  env:
    COPILOT_PROVIDER_BASE_URL: http://192.168.1.121:14000/v1
    COPILOT_MODEL: claude-sonnet-4-6
    COPILOT_PROVIDER_API_KEY: ${{ secrets.FAILOVER_KEY }}

tools:
  github:
    # min-integrity stays `none` here: this workflow only READS repo state and
    # files a report. It never acts on untrusted content, so it does not need
    # author-trust gating. Scope is enforced by deploying it only into managed
    # repos, not by reading-scope here.
    min-integrity: none
    toolsets: [repos, issues, pull_requests]

safe-outputs:
  # threat-detection runs inside the AWF sandbox, which is disabled on this runner
  threat-detection: false
  mentions: false
  create-issue:
    title-prefix: "[repo-status] "
    labels: [report, daily-status]
    close-older-issues: true
---

# Repo Status + Governance Baseline


{{#runtime-import shared/agent-rules.md}}

Create a daily status report for this repository as a GitHub issue, and flag any
drift from the CentralRepoOps standards baseline.

## What to include

1. **Activity** — recent issues, PRs, releases, and notable code changes.
2. **Governance baseline** — check and report on:
   - required docs present (`README.md`, plus repo-specific files such as
     `HANDOFF.md`, `AGENTS.md`, `CODING_STANDARDS.md` where they apply)
   - baseline labels exist (`bug`, `enhancement`, `documentation`)
   - branch protection / required-review expectations appear to be in place
   - at least one active CI / automation path exists
3. **Recommendations** — concrete, actionable next steps for maintainers.

## Constraints

- Do not invent repo state you did not observe. If a check could not be
  verified, say `not verified` rather than guessing.
- Prefer concrete findings over generic best-practice advice.
- Keep it concise; scale length to actual activity.

## Process

1. Gather recent activity from the repository.
2. Run the governance-baseline checks above.
3. File one GitHub issue with the status report and any drift findings.
