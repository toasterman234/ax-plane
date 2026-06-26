// Repo-OWNERSHIP router (issue #105, path B).
//
// Deterministic — no model. Scores an issue's title+body against the per-repo
// `owns` map in manifests/repos.json and decides which repo owns it. On a
// confident single winner it can transfer the issue there; otherwise it leaves
// the issue in place and labels it for a human.
//
// Decision (precedence, matching manifests/repos.json -> ownership.precedence):
//   - score each repo = count of distinct owns.keywords/topics found in text
//   - skip self-managed bot reports ([repo-status]/[fleet-status]/[triage]/[deps])
//   - control-plane hit >= top repo score        -> KEEP   (owner:keep)
//   - top score == 0                             -> KEEP   (owner:keep)
//   - tie at the top (two repos share max > 0)   -> HUMAN  (owner:needs-human)
//   - otherwise single clear winner              -> MOVE   (owner:<id> + transfer)
//
// Usage:
//   node scripts/route-owner.mjs classify        # reads ISSUE_TITLE/ISSUE_BODY env, prints JSON
//   node scripts/route-owner.mjs run <number>     # classify one issue, label + (maybe) transfer
//   node scripts/route-owner.mjs sweep [--dry-run]# all open issues lacking an owner:* label
//
// Side-effecting modes use GitHub REST (scripts/lib/github-rest.mjs). Issue transfer
// is the only GraphQL call (rare). Requires GH_TOKEN (FLEET_WRITE_TOKEN) and
// SELF_REPO in env.

import { readJson, manifestPaths } from "./lib/manifest.mjs";
import {
  addIssueLabels,
  commentOnIssue,
  getIssue,
  listOpenIssues,
  transferIssue,
} from "./lib/github-rest.mjs";

const SELF_REPO = process.env.SELF_REPO || "toasterman234/central-repo-ops";
const BOT_PREFIXES = ["[repo-status]", "[fleet-status]", "[triage]", "[deps]", "[fleet-status", "[fix]"];

function loadOwnership(baseDir = process.cwd()) {
  const manifest = readJson(manifestPaths(baseDir).repos);
  return { ownership: manifest.ownership || {}, repos: manifest.repos || [] };
}

const TITLE_WEIGHT = 3;
function matchSignals(haystack, signals) {
  return signals.filter((s) => haystack.includes(String(s).toLowerCase()));
}
function scoreRepo(titleLc, bodyLc, repo) {
  const owns = repo.owns || {};
  const signals = [...(owns.keywords || []), ...(owns.topics || [])].map((s) => String(s).toLowerCase());
  const titleHits = matchSignals(titleLc, signals);
  const bodyHits = matchSignals(bodyLc, signals).filter((s) => !titleHits.includes(s));
  return {
    id: repo.id,
    repo: repo.repo,
    titleHits,
    bodyHits,
    score: titleHits.length * TITLE_WEIGHT + bodyHits.length,
  };
}

export function classify(title, body, { ownership, repos }) {
  const titleLc = (title || "").toLowerCase();
  const bodyLc = (body || "").toLowerCase();

  if (BOT_PREFIXES.some((p) => titleLc.startsWith(p))) {
    return { action: "keep", label: "owner:keep", reason: "self-managed bot report — stays in control repo" };
  }

  const cpKeywords = (ownership.control_plane_keywords || []).map((k) => k.toLowerCase());
  const cpScore = matchSignals(titleLc, cpKeywords).length * TITLE_WEIGHT + matchSignals(bodyLc, cpKeywords).length;

  const scored = repos
    .filter((r) => r.repo !== SELF_REPO && r.owns)
    .map((r) => scoreRepo(titleLc, bodyLc, r))
    .sort((a, b) => b.score - a.score);

  const top = scored[0] || { score: 0, titleHits: [], bodyHits: [] };
  const runner = scored[1] || { score: 0 };
  const allHits = [...top.titleHits, ...top.bodyHits].join(", ");

  if (top.score === 0) {
    return { action: "keep", label: "owner:keep", reason: "no owner keyword matched — stays in control repo", cpScore };
  }
  if (cpScore >= top.score) {
    return { action: "keep", label: "owner:keep", reason: `control-plane signal (${cpScore}) >= top repo (${top.score}) — stays`, cpScore };
  }
  if (top.score === runner.score) {
    return {
      action: "human",
      label: "owner:needs-human",
      reason: `ambiguous: ${top.id} and ${runner.id} both scored ${top.score}`,
      candidates: [top, runner],
    };
  }
  if (top.titleHits.length === 0) {
    return {
      action: "human",
      label: "owner:needs-human",
      reason: `${top.id} only matched in body (${top.bodyHits.join(", ")}), not the title — needs a human to confirm`,
    };
  }
  return {
    action: "move",
    label: `owner:${top.id}`,
    target_id: top.id,
    target_repo: top.repo,
    reason: `confident: ${top.id} (title: ${top.titleHits.join(", ") || "—"}; body: ${top.bodyHits.join(", ") || "—"}); runner-up ${runner.id || "none"} ${runner.score}`,
  };
}

function applyLabel(num, label) {
  addIssueLabels(SELF_REPO, num, [label]);
}
function comment(num, body) {
  commentOnIssue(SELF_REPO, num, body);
}
function transfer(num, destRepo) {
  return transferIssue(SELF_REPO, num, destRepo);
}

function footerFields(decision) {
  switch (decision.action) {
    case "move":
      return {
        status: `done — moved to \`${decision.target_repo}\``,
        next: `follow this issue in \`${decision.target_repo}\` from now on`,
        waiting: "nothing",
        why: `this issue is mostly about \`${decision.target_repo}\`, so it belongs there.`,
      };
    case "human":
      return {
        status: "waiting — needs you to place it",
        next: "pick which repo this belongs in (then re-run, or move it yourself)",
        waiting: "you",
        why: "two repos matched it equally, so the router won't guess.",
      };
    default:
      return {
        status: "done — issue stays in this repo",
        next: "nothing — unless you think it's filed in the wrong repo",
        waiting: "nothing",
        why: "this issue is mostly control-plane work, which lives in this repo.",
      };
  }
}

export function commentBody(decision) {
  const lines = [
    "## 🧭 Owner routing",
    "",
    `**Decision:** \`${decision.action}\` → \`${decision.label}\``,
  ];
  if (decision.action === "move") lines.push(`**Transferring to:** \`${decision.target_repo}\``);
  if (decision.action === "human") lines.push("_Two repos tied — leaving here for a human to place._");

  const f = footerFields(decision);
  lines.push(
    "",
    "---",
    "🔻 Bottom line",
    `- Status: ${f.status}`,
    `- Next: ${f.next}`,
    `- Waiting on: ${f.waiting}`,
    `- Why: ${f.why}`,
    "",
    `<sub>Deterministic owner router (issue #105). Reversible: transfer back if wrong. Score detail: ${decision.reason}</sub>`,
  );
  return lines.join("\n");
}

function handleIssue(issue, ownership, dryRun) {
  const decision = classify(issue.title, issue.body || "", ownership);
  const tag = `#${issue.number} "${issue.title.slice(0, 60)}"`;
  console.log(`${tag}\n  → ${decision.action.toUpperCase()} ${decision.label} :: ${decision.reason}`);
  if (dryRun) return decision;

  applyLabel(issue.number, decision.label);
  comment(issue.number, commentBody(decision));
  if (decision.action === "move") {
    const url = transfer(issue.number, decision.target_repo);
    console.log(`  transferred → ${url}`);
  }
  return decision;
}

function fetchOpenIssues() {
  const all = listOpenIssues(SELF_REPO, { limit: 300 });
  return all.filter((i) => !(i.labels || []).some((l) => l.name.startsWith("owner:")));
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const ownership = loadOwnership();

  if (cmd === "classify") {
    console.log(JSON.stringify(classify(process.env.ISSUE_TITLE, process.env.ISSUE_BODY, ownership), null, 2));
    return;
  }
  if (cmd === "run") {
    const num = rest[0];
    if (!num) throw new Error("run requires an issue number");
    const issue = getIssue(SELF_REPO, num);
    if ((issue.labels || []).some((l) => l.name.startsWith("owner:"))) {
      console.log(`#${num} already has an owner:* label — skipping (idempotent).`);
      return;
    }
    handleIssue(issue, ownership, false);
    return;
  }
  if (cmd === "sweep") {
    const dryRun = rest.includes("--dry-run");
    const issues = fetchOpenIssues();
    console.log(`sweep: ${issues.length} open issues without an owner:* label${dryRun ? " (DRY RUN)" : ""}\n`);
    const tally = { move: 0, keep: 0, human: 0 };
    for (const issue of issues) {
      const d = handleIssue(issue, ownership, dryRun);
      tally[d.action]++;
    }
    console.log(`\nsummary: move=${tally.move} keep=${tally.keep} human=${tally.human}`);
    return;
  }
  throw new Error(`unknown command: ${cmd || "(none)"} — use classify | run <n> | sweep [--dry-run]`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
