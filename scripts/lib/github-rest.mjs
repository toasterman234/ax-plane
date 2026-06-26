// Thin GitHub REST client via `gh api` (core rate limit, not GraphQL).
//
// Deterministic fleet scripts used to shell out to `gh issue` / `gh project`,
// which route through the GraphQL API and were exhausting the 5k/hr GraphQL
// budget while REST still had headroom. All high-volume reads/writes here use
// REST; transferIssue remains a single GraphQL mutation (rare).
import { execFileSync } from "node:child_process";

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const TRANSIENT = /TLS handshake timeout|i\/o timeout|\btimeout\b|connection reset|connection refused|\bEOF\b|temporary failure|no such host|502|503|504|429|rate limit/i;

function execGh(args, { input } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync("gh", args, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        input,
        env: process.env,
      });
    } catch (e) {
      const msg = String(e.stderr || e.message || e);
      if (attempt >= 4 || !TRANSIENT.test(msg)) throw e;
      console.error(`  ~ gh api retry ${attempt}/3 after transient error: ${msg.slice(0, 100)}`);
      sleepSync(500 * 2 ** (attempt - 1));
    }
  }
}

/** @param {"GET"|"POST"|"PATCH"|"DELETE"} method */
export function ghApi(method, endpoint, body = undefined) {
  const args = ["api", endpoint, "-H", "Accept: application/vnd.github+json"];
  if (method !== "GET") args.splice(1, 0, "-X", method);
  if (body !== undefined) {
    args.push("--input", "-");
    return JSON.parse(execGh(args, { input: JSON.stringify(body) }) || "null");
  }
  const raw = execGh(args);
  return raw ? JSON.parse(raw) : null;
}

/** Fetch every page of a list endpoint; merges JSON arrays. */
export function ghApiPaginate(endpoint) {
  const raw = execGh(["api", "--paginate", endpoint, "-H", "Accept: application/vnd.github+json"]);
  if (!raw?.trim()) return [];
  const merged = [];
  for (const line of raw.trim().split("\n")) {
    if (!line) continue;
    const chunk = JSON.parse(line);
    if (Array.isArray(chunk)) merged.push(...chunk);
    else merged.push(chunk);
  }
  return merged;
}

export function parseRepo(full) {
  const i = full.indexOf("/");
  if (i < 1) throw new Error(`invalid repo: ${full}`);
  return { owner: full.slice(0, i), repo: full.slice(i + 1) };
}

export function listOpenIssues(full, { limit = 300 } = {}) {
  const { owner, repo } = parseRepo(full);
  const issues = ghApiPaginate(
    `/repos/${owner}/${repo}/issues?state=open&per_page=100`,
  ).filter((i) => !i.pull_request);
  return issues.slice(0, limit).map((i) => ({
    number: i.number,
    title: i.title,
    body: i.body || "",
    url: i.html_url,
    labels: (i.labels || []).map((l) => ({ name: l.name })),
  }));
}

export function getIssue(full, number) {
  const { owner, repo } = parseRepo(full);
  const i = ghApi("GET", `/repos/${owner}/${repo}/issues/${number}`);
  return {
    number: i.number,
    title: i.title,
    body: i.body || "",
    url: i.html_url,
    node_id: i.node_id,
    labels: (i.labels || []).map((l) => ({ name: l.name })),
  };
}

export function addIssueLabels(full, number, labels) {
  const { owner, repo } = parseRepo(full);
  const issue = ghApi("GET", `/repos/${owner}/${repo}/issues/${number}`);
  const names = new Set((issue.labels || []).map((l) => l.name));
  for (const label of labels) names.add(label);
  ghApi("PATCH", `/repos/${owner}/${repo}/issues/${number}`, {
    labels: [...names],
  });
}

export function commentOnIssue(full, number, body) {
  const { owner, repo } = parseRepo(full);
  return ghApi("POST", `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
}

export function listIssueComments(full, number) {
  const { owner, repo } = parseRepo(full);
  return ghApiPaginate(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`);
}

/** POST labels without replacing the full label set (cheaper than PATCH). */
export function postIssueLabels(full, number, labels) {
  const { owner, repo } = parseRepo(full);
  ghApi("POST", `/repos/${owner}/${repo}/issues/${number}/labels`, { labels });
}

export function removeIssueLabel(full, number, label) {
  const { owner, repo } = parseRepo(full);
  ghApi("DELETE", `/repos/${owner}/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`);
}

export function closeIssue(full, number) {
  const { owner, repo } = parseRepo(full);
  ghApi("PATCH", `/repos/${owner}/${repo}/issues/${number}`, { state: "closed" });
}

export function assignIssue(full, number, assignees) {
  const { owner, repo } = parseRepo(full);
  ghApi("PATCH", `/repos/${owner}/${repo}/issues/${number}`, { assignees });
}

/** Search API (REST) — use instead of `gh issue list --search` (GraphQL). */
export function searchOpenIssues(repoFull, query, { limit = 100 } = {}) {
  const { owner, repo } = parseRepo(repoFull);
  const q = `repo:${owner}/${repo} is:issue is:open ${query}`;
  const data = ghApi("GET", `/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 100)}`);
  return (data?.items || [])
    .filter((i) => !i.pull_request)
    .slice(0, limit)
    .map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body || "",
      url: i.html_url,
      labels: (i.labels || []).map((l) => ({ name: l.name })),
    }));
}

/** Rare path — only GraphQL touchpoint in this module. */
export function transferIssue(full, number, destFull) {
  const issue = getIssue(full, number);
  const { owner, repo } = parseRepo(destFull);
  const dest = ghApi("GET", `/repos/${owner}/${repo}`);
  const payload = {
    query: `mutation($issueId: ID!, $repositoryId: ID!) {
      transferIssue(input: { issueId: $issueId, repositoryId: $repositoryId }) {
        issue { url }
      }
    }`,
    variables: { issueId: issue.node_id, repositoryId: dest.node_id },
  };
  const raw = execGh(["api", "graphql", "--input", "-"], { input: JSON.stringify(payload) });
  const data = JSON.parse(raw);
  const url = data?.data?.transferIssue?.issue?.url;
  if (!url) {
    const err = data?.errors?.[0]?.message || "transferIssue returned no url";
    throw new Error(err);
  }
  return url;
}

// ---- Projects v2 (user-owned) -----------------------------------------------

export function resolveProjectOwner(fallback) {
  const raw = process.env.PROJECT_SYNC_OWNER || fallback;
  if (raw === "@me") return fallback;
  return raw.replace(/^@/, "");
}

export function getUserProject(owner, projectNumber) {
  return ghApi("GET", `/users/${owner}/projectsV2/${projectNumber}`);
}

export function listProjectFields(owner, projectNumber) {
  return ghApiPaginate(`/users/${owner}/projectsV2/${projectNumber}/fields`);
}

export function listProjectItems(owner, projectNumber, { limit = 1000 } = {}) {
  return ghApiPaginate(`/users/${owner}/projectsV2/${projectNumber}/items?per_page=100`).slice(0, limit);
}

export function addProjectIssue(owner, projectNumber, repoFull, issueNumber) {
  const { owner: repoOwner, repo } = parseRepo(repoFull);
  return ghApi("POST", `/users/${owner}/projectsV2/${projectNumber}/items`, {
    type: "Issue",
    owner: repoOwner,
    repo,
    number: issueNumber,
  });
}

export function updateProjectItemFields(owner, projectNumber, itemId, fields) {
  return ghApi("PATCH", `/users/${owner}/projectsV2/${projectNumber}/items/${itemId}`, {
    fields,
  });
}

/** Remove a closed issue from the board (REST delete ≡ archive off the project). */
export function deleteProjectItem(owner, projectNumber, itemId) {
  ghApi("DELETE", `/users/${owner}/projectsV2/${projectNumber}/items/${itemId}`);
}
