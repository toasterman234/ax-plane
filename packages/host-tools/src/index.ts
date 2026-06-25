import { docsSearch } from './docs';
import {
  githubCreateBranch,
  githubCreateIssue,
  githubCreatePr,
  githubReadFile,
  githubReadIssue,
  githubSearchIssues,
} from './github';
import { getHostToolDefinition } from './catalog';
import { repoListFiles, repoReadFile, repoSearch, repoWriteFile } from './repo';
import { shellRun } from './shell';

function fakeProjectLookup(args: { query: string }) {
  return {
    project: 'AxPlane MVP',
    constraints: ['local-first', 'approval-gated tools', 'durable event log'],
    query: args.query,
  };
}

function fakeRiskyAction(args: Record<string, unknown>) {
  return { ok: true, fakeSideEffect: 'approved-risky-action-executed', received: args };
}

export async function executeHostTool(qualifiedName: string, args: Record<string, unknown>): Promise<unknown> {
  switch (qualifiedName) {
    case 'fake.projectLookup':
      return fakeProjectLookup(args as { query: string });
    case 'fake.riskyAction':
      return fakeRiskyAction(args);
    case 'repo.listFiles':
      return repoListFiles(args as { path?: string; maxEntries?: number });
    case 'repo.readFile':
      return repoReadFile(args as { path: string; maxChars?: number });
    case 'repo.search':
      return repoSearch(args as { query: string; path?: string; maxResults?: number });
    case 'repo.writeFile':
      return repoWriteFile(args as { path: string; content: string });
    case 'github.searchIssues':
      return githubSearchIssues(args as { query: string; owner?: string; repo?: string; limit?: number });
    case 'github.readIssue':
      return githubReadIssue(args as { number: number; owner?: string; repo?: string });
    case 'github.readFile':
      return githubReadFile(args as { path: string; ref?: string; owner?: string; repo?: string });
    case 'github.createIssue':
      return githubCreateIssue(args as { title: string; body?: string; owner?: string; repo?: string });
    case 'github.createBranch':
      return githubCreateBranch(args as { branch: string; fromRef?: string; owner?: string; repo?: string });
    case 'github.createPR':
      return githubCreatePr(args as { title: string; head: string; base?: string; body?: string; owner?: string; repo?: string });
    case 'docs.search':
      return docsSearch(args as { query: string; maxResults?: number });
    case 'shell.run':
      return shellRun(args as { command: string; cwd?: string });
    default:
      throw new Error(`Unknown host tool: ${qualifiedName}`);
  }
}

export function defaultToolRisk(qualifiedName: string): 'safe' | 'risky' {
  return getHostToolDefinition(qualifiedName)?.risk ?? 'safe';
}

export * from './catalog';
export { repoRoot, docsRoot } from './paths';
