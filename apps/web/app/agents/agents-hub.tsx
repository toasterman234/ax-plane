'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { HubShell } from '@/components/hub-shell';

export const AGENTS_HUB_SEGMENTS = new Set(['tools', 'memory', 'eval', 'forge', 'experiments']);

export function isAgentDetailPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'agents' || parts.length !== 2) return false;
  return !AGENTS_HUB_SEGMENTS.has(parts[1]!);
}

const TABS = [
  { href: '/agents', label: 'Registry', match: (path: string) => path === '/agents' },
  { href: '/agents/tools', label: 'Tools', match: (path: string) => path.startsWith('/agents/tools') },
  { href: '/agents/memory', label: 'Memory', match: (path: string) => path.startsWith('/agents/memory') },
  { href: '/agents/eval', label: 'Eval', match: (path: string) => path.startsWith('/agents/eval') },
  { href: '/agents/experiments', label: 'Experiments', match: (path: string) => path.startsWith('/agents/experiments') },
  { href: '/agents/forge', label: 'Forge', match: (path: string) => path.startsWith('/agents/forge') },
] as const;

const TAB_DESCRIPTIONS: Record<string, string> = {
  registry: 'Create, duplicate, and configure Ax agents.',
  tools: 'Built-in host tools plus registered HTTP webhooks — enable per agent in the editor.',
  memory: 'Persistent recall across runs. The memory kernel auto-injects relevant entries at run start.',
  eval: 'Run deterministic case suites against an agent version. Mock mode is fast; real mode calls the LLM.',
  experiments: 'Timeline, compare workspace, and suite health across eval and optimization activity.',
  forge: 'Intake → scaffold → eval suite → commit → optional optimize. Mock mode works without API keys.',
};

function tabDescription(pathname: string): string {
  if (pathname.startsWith('/agents/tools')) return TAB_DESCRIPTIONS.tools;
  if (pathname.startsWith('/agents/memory')) return TAB_DESCRIPTIONS.memory;
  if (pathname.startsWith('/agents/eval')) return TAB_DESCRIPTIONS.eval;
  if (pathname.startsWith('/agents/experiments')) return TAB_DESCRIPTIONS.experiments;
  if (pathname.startsWith('/agents/forge')) return TAB_DESCRIPTIONS.forge;
  return TAB_DESCRIPTIONS.registry;
}

export function AgentsHub({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <HubShell
      title="Agents"
      description={tabDescription(pathname)}
      tabs={[...TABS]}
      pathname={pathname}
    >
      {children}
    </HubShell>
  );
}
