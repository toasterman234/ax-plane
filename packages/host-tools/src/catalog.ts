export type HostToolRisk = 'safe' | 'risky';

export type HostToolDefinition = {
  qualifiedName: string;
  namespace: string;
  name: string;
  description: string;
  risk: HostToolRisk;
  parameters: Record<string, unknown>;
};

export const HOST_TOOL_CATALOG: HostToolDefinition[] = [
  {
    qualifiedName: 'fake.projectLookup',
    namespace: 'fake',
    name: 'projectLookup',
    description: 'Return deterministic fake project context for demos.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    qualifiedName: 'fake.riskyAction',
    namespace: 'fake',
    name: 'riskyAction',
    description: 'Fake side-effecting action for approval-gate testing.',
    risk: 'risky',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
  {
    qualifiedName: 'repo.listFiles',
    namespace: 'repo',
    name: 'listFiles',
    description: 'List files under a path in the configured repo root.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path (default .)' },
        maxEntries: { type: 'number' },
      },
    },
  },
  {
    qualifiedName: 'repo.readFile',
    namespace: 'repo',
    name: 'readFile',
    description: 'Read a text file from the repo root.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxChars: { type: 'number' },
      },
      required: ['path'],
    },
  },
  {
    qualifiedName: 'repo.search',
    namespace: 'repo',
    name: 'search',
    description: 'Search file contents under the repo root.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string' },
        maxResults: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    qualifiedName: 'repo.writeFile',
    namespace: 'repo',
    name: 'writeFile',
    description: 'Write a text file under the repo root (approval required).',
    risk: 'risky',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    qualifiedName: 'github.searchIssues',
    namespace: 'github',
    name: 'searchIssues',
    description: 'Search GitHub issues in a repo.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    qualifiedName: 'github.readIssue',
    namespace: 'github',
    name: 'readIssue',
    description: 'Read a GitHub issue by number.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        number: { type: 'number' },
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      required: ['number'],
    },
  },
  {
    qualifiedName: 'github.readFile',
    namespace: 'github',
    name: 'readFile',
    description: 'Read a file from a GitHub repo via the API.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        ref: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    qualifiedName: 'github.createIssue',
    namespace: 'github',
    name: 'createIssue',
    description: 'Create a GitHub issue (approval required).',
    risk: 'risky',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    qualifiedName: 'github.createBranch',
    namespace: 'github',
    name: 'createBranch',
    description: 'Create a Git branch on GitHub (approval required).',
    risk: 'risky',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string' },
        fromRef: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      required: ['branch'],
    },
  },
  {
    qualifiedName: 'github.createPR',
    namespace: 'github',
    name: 'createPR',
    description: 'Open a GitHub pull request (approval required).',
    risk: 'risky',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        head: { type: 'string' },
        base: { type: 'string' },
        body: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      required: ['title', 'head'],
    },
  },
  {
    qualifiedName: 'docs.search',
    namespace: 'docs',
    name: 'search',
    description: 'Search markdown docs under AXPLANE_DOCS_ROOT.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    qualifiedName: 'shell.run',
    namespace: 'shell',
    name: 'run',
    description: 'Run a shell command in the repo (approval required).',
    risk: 'risky',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
      },
      required: ['command'],
    },
  },
];

export function getHostToolDefinition(qualifiedName: string): HostToolDefinition | undefined {
  return HOST_TOOL_CATALOG.find((tool) => tool.qualifiedName === qualifiedName);
}

export function listHostToolsForAgent(toolNames: string[]): HostToolDefinition[] {
  return toolNames
    .map((name) => getHostToolDefinition(name))
    .filter((tool): tool is HostToolDefinition => Boolean(tool));
}
