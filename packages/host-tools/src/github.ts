type GithubRepo = { owner: string; repo: string };

function githubToken(): string {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN (or GH_TOKEN) is not configured');
  return token;
}

function parseRepo(args: { owner?: string; repo?: string }): GithubRepo {
  if (args.owner && args.repo) return { owner: args.owner, repo: args.repo };
  const fallback = process.env.GITHUB_REPO ?? process.env.AXPLANE_GITHUB_REPO;
  if (!fallback?.includes('/')) {
    throw new Error('Provide owner+repo args or set GITHUB_REPO=owner/repo');
  }
  const [owner, repo] = fallback.split('/');
  return { owner: owner!, repo: repo! };
}

async function githubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export async function githubSearchIssues(args: { query: string; owner?: string; repo?: string; limit?: number }) {
  const { owner, repo } = parseRepo(args);
  const q = `${args.query} repo:${owner}/${repo}`;
  const data = await githubRequest<{ items: unknown[] }>(`/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(args.limit ?? 10, 30)}`);
  return { owner, repo, query: args.query, items: data.items };
}

export async function githubReadIssue(args: { number: number; owner?: string; repo?: string }) {
  const { owner, repo } = parseRepo(args);
  const issue = await githubRequest<Record<string, unknown>>(`/repos/${owner}/${repo}/issues/${args.number}`);
  return { owner, repo, issue };
}

export async function githubReadFile(args: { path: string; ref?: string; owner?: string; repo?: string }) {
  const { owner, repo } = parseRepo(args);
  const ref = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
  const file = await githubRequest<{ content?: string; encoding?: string; path?: string }>(
    `/repos/${owner}/${repo}/contents/${args.path.split('/').map(encodeURIComponent).join('/')}${ref}`,
  );
  const content = file.encoding === 'base64' && file.content
    ? Buffer.from(file.content, 'base64').toString('utf8').slice(0, 64_000)
    : '';
  return { owner, repo, path: args.path, content };
}

export async function githubCreateIssue(args: { title: string; body?: string; owner?: string; repo?: string }) {
  const { owner, repo } = parseRepo(args);
  const issue = await githubRequest<Record<string, unknown>>(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: args.title, body: args.body ?? '' }),
  });
  return { owner, repo, issue };
}

export async function githubCreateBranch(args: { branch: string; fromRef?: string; owner?: string; repo?: string }) {
  const { owner, repo } = parseRepo(args);
  const fromRef = args.fromRef ?? 'HEAD';
  const ref = await githubRequest<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${fromRef.replace(/^refs\/heads\//, '')}`).catch(async () => {
    const repoMeta = await githubRequest<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    return githubRequest<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${repoMeta.default_branch}`);
  });
  const created = await githubRequest<Record<string, unknown>>(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: ref.object.sha }),
  });
  return { owner, repo, branch: args.branch, ref: created };
}

export async function githubCreatePr(args: {
  title: string;
  head: string;
  base?: string;
  body?: string;
  owner?: string;
  repo?: string;
}) {
  const { owner, repo } = parseRepo(args);
  const pr = await githubRequest<Record<string, unknown>>(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: args.title,
      head: args.head,
      base: args.base ?? 'main',
      body: args.body ?? '',
    }),
  });
  return { owner, repo, pullRequest: pr };
}
