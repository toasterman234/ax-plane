import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Providers } from '@/components/providers';
import { AppStatusBanner } from '@/components/app-status-banner';

export const metadata: Metadata = {
  title: 'AxPlane MVP',
  description: 'Local-first Ax LLM control plane MVP',
};

const nav = [
  ['/', 'Home'],
  ['/agents', 'Agents'],
  ['/tools', 'Tools'],
  ['/memory', 'Memory'],
  ['/eval', 'Eval'],
  ['/workflows', 'Workflows'],
  ['/ax-flows', 'AX Flows'],
  ['/requests', 'Requests'],
  ['/runs', 'Runs'],
  ['/approvals', 'Approvals'],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen grid grid-cols-[220px_1fr]">
            <aside className="border-r border-slate-800 p-4">
              <div className="mb-6 text-xl font-semibold">AxPlane</div>
              <nav className="space-y-2">
                {nav.map(([href, label]) => (
                  <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white">
                    {label}
                  </Link>
                ))}
              </nav>
            </aside>
            <main className="p-6">
              <AppStatusBanner />
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
