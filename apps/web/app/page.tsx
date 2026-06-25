import Link from 'next/link';
import { Card } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AxPlane MVP</h1>
        <p className="mt-2 text-muted-foreground">A local-first control plane around Ax runs, events, and approvals.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">1. Submit request</h2>
          <p className="mt-2 text-sm text-muted-foreground">Create an inbox request for the default agent.</p>
          <Link className="mt-4 inline-block text-primary underline" href="/operations/requests">Open Requests</Link>
        </Card>
        <Card>
          <h2 className="font-semibold">2. Watch run</h2>
          <p className="mt-2 text-sm text-muted-foreground">Open the run timeline and stream events live over SSE.</p>
          <Link className="mt-4 inline-block text-primary underline" href="/operations/runs">Open Runs</Link>
        </Card>
        <Card>
          <h2 className="font-semibold">3. Approve tool</h2>
          <p className="mt-2 text-sm text-muted-foreground">Approve the approval-gated tool and let the worker complete the run.</p>
          <Link className="mt-4 inline-block text-primary underline" href="/operations/approvals">Open Approvals</Link>
        </Card>
      </div>
    </div>
  );
}
