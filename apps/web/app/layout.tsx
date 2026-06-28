import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Providers } from '@/components/providers';
import { AppStatusBanner } from '@/components/app-status-banner';

export const metadata: Metadata = {
  title: 'Ax Plane',
  description: 'Local-first control plane for @ax-llm/ax — runs, approvals, eval, workflows',
};

const nav = [
  ['/', 'Home'],
  ['/chat', 'Chat'],
  ['/agents', 'Agents'],
  ['/workflows', 'Workflows'],
  ['/operations', 'Operations'],
  ['/settings', 'Settings'],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <div className="grid min-h-screen min-w-0 grid-cols-[220px_minmax(0,1fr)] bg-background">
            <aside className="border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
              <div className="mb-6 text-xl font-semibold text-sidebar-primary">Ax Plane</div>
              <nav className="space-y-1">
                {nav.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="block rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </aside>
            <main className="min-w-0 overflow-x-hidden bg-background p-6 text-foreground">
              <AppStatusBanner />
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
