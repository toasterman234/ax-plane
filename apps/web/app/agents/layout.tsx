'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AgentsHub, isAgentDetailPath } from './agents-hub';

export default function AgentsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isAgentDetailPath(pathname)) {
    return children;
  }

  return <AgentsHub>{children}</AgentsHub>;
}
