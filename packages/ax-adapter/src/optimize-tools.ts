import { listHostToolsForAgent } from '@axplane/host-tools';
import { toAxFunctionName } from './build-functions';

export function stubToolResult(qualifiedName: string, args: Record<string, unknown>): unknown {
  switch (qualifiedName) {
    case 'fake.projectLookup':
      return {
        query: String(args.query ?? ''),
        project: 'AxPlane',
        status: 'active',
        summary: 'Deterministic eval-safe project context for optimization.',
      };
    case 'fake.riskyAction':
      return { ok: true, approved: false, reason: String(args.reason ?? 'eval-safe stub') };
    case 'repo.listFiles':
      return { files: ['README.md', 'package.json'], path: String(args.path ?? '.') };
    case 'repo.readFile':
      return { path: String(args.path ?? 'README.md'), content: '# AxPlane\nEval-safe stub content.' };
    case 'repo.search':
      return { matches: [{ path: 'README.md', snippet: 'AxPlane control plane' }] };
    case 'docs.search':
      return { hits: [{ title: 'Architecture', snippet: 'web → API → worker' }] };
    case 'memory.save':
      return { saved: true, key: String(args.key ?? 'eval') };
    case 'memory.search':
      return { entries: [{ content: 'Operator prefers concise answers.', score: 0.9 }] };
    case 'memory.list':
      return { entries: [] };
    default:
      return { ok: true, tool: qualifiedName, args };
  }
}

/** In-memory tool stubs for agent.optimize() — avoids host side effects during tuning. */
export function buildEvalSafeAxFunctions(toolNames: string[]) {
  return listHostToolsForAgent(toolNames, []).map((tool) => ({
    name: toAxFunctionName(tool.qualifiedName),
    description: `[${tool.qualifiedName}] ${tool.description}`,
    parameters: tool.parameters as import('@ax-llm/ax').AxFunction['parameters'],
    func: async (args: Record<string, unknown>) =>
      stubToolResult(tool.qualifiedName, args ?? {}),
  }));
}
