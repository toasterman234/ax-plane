import { cn } from '@/lib/utils';

/** Specimen grid — only uses shadcn semantic Tailwind classes inside a themed preview shell. */
export function ThemeGallery({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-8 p-6', className)}>
      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Typography</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">AxPlane control plane</h1>
        <h2 className="text-xl font-semibold text-foreground">Run lifecycle &amp; approvals</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Preview how body copy, labels, and monospace IDs read on this palette. The rest of the app
          still uses legacy slate classes until you adopt tokens page by page.
        </p>
        <p className="font-mono text-xs text-muted-foreground">run_8f3a2c91 · agent.default_ax_agent · SSE live</p>
      </section>

      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Buttons</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Primary
          </button>
          <button type="button" className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:opacity-90">
            Secondary
          </button>
          <button type="button" className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Outline
          </button>
          <button type="button" className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90">
            Destructive
          </button>
          <button type="button" className="rounded-md px-3 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Ghost link
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
          <h3 className="font-semibold">Card / panel</h3>
          <p className="mt-2 text-sm text-muted-foreground">Surface for run detail, agent config, or workflow builder sections.</p>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">running</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">needs approval</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-sm">
          <h3 className="font-semibold">Popover surface</h3>
          <p className="mt-2 text-sm text-muted-foreground">Dialogs, sheets, and floating panels share this elevation.</p>
        </div>
      </section>

      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Form controls</p>
        <div className="grid max-w-xl gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Request</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Summarize the repo README and call fake.riskyAction"
              readOnly
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Notes</span>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="Optional context for the router."
              readOnly
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Data table strip</p>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-4 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Run</span>
            <span>Agent</span>
            <span>Status</span>
            <span className="text-right">Tokens</span>
          </div>
          {[
            ['ht849j', 'research-router', 'completed', '1,204'],
            ['kn4h83', 'project-plan', 'running', '—'],
            ['v3n3jx', 'default_ax_agent', 'needs_approval', '412'],
          ].map(([id, agent, status, tok]) => (
            <div key={id} className="grid grid-cols-4 gap-2 border-b border-border px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-xs">{id}</span>
              <span className="truncate text-foreground">{agent}</span>
              <span className="text-muted-foreground">{status}</span>
              <span className="text-right font-mono text-xs text-muted-foreground">{tok}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-border bg-accent/30 p-4">
        <p className="text-sm text-accent-foreground">
          Accent strip — use for banners, API health warnings, or inline hints.
        </p>
      </section>
    </div>
  );
}
