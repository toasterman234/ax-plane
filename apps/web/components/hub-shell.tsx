'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export type HubTab = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  badge?: number;
};

export function HubShell({
  title,
  description,
  tabs,
  pathname,
  children,
}: {
  title: string;
  description: string;
  tabs: HubTab[];
  pathname: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {tab.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
