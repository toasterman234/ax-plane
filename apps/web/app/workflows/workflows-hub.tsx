'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const TABS = [
  { href: '/workflows', label: 'Graph', match: (path: string) => path === '/workflows' },
  {
    href: '/workflows/ax-flows',
    label: 'AX Flows',
    match: (path: string) => path === '/workflows/ax-flows' || path.startsWith('/workflows/ax-flows/'),
  },
  {
    href: '/workflows/dispatcher',
    label: 'Dispatcher',
    match: (path: string) => path === '/workflows/dispatcher' || path.startsWith('/workflows/dispatcher/'),
  },
] as const;

const TAB_DESCRIPTIONS: Record<string, string> = {
  '/workflows':
    'Control-plane graph workflows spawn child agent runs with handoffs — not in-process Ax child loops.',
  '/workflows/ax-flows':
    'ax-llm flow() programs from ax-server — structure, engine run history, live SSE runs, and governed AxPlane runs (runKind: axflow).',
  '/workflows/dispatcher':
    'Proxied ax-server /dispatcher — dynamic RLM supervisor with team.planner, team.coder, team.researcher. Governed runs use runKind: axdispatcher.',
};

function tabDescription(pathname: string): string {
  if (pathname.startsWith('/workflows/dispatcher')) return TAB_DESCRIPTIONS['/workflows/dispatcher'];
  if (pathname.startsWith('/workflows/ax-flows')) return TAB_DESCRIPTIONS['/workflows/ax-flows'];
  return TAB_DESCRIPTIONS['/workflows'];
}

export function WorkflowsHub({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="mt-1 text-muted-foreground">{tabDescription(pathname)}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
