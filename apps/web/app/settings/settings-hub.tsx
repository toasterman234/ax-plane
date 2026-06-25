'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { HubShell } from '@/components/hub-shell';

const TABS = [
  { href: '/settings/themes', label: 'Theme lab', match: (path: string) => path === '/settings' || path.startsWith('/settings/themes') },
] as const;

export function SettingsHub({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <HubShell
      title="Settings"
      description="Developer and appearance options for the AxPlane dashboard."
      tabs={[...TABS]}
      pathname={pathname}
    >
      {children}
    </HubShell>
  );
}
