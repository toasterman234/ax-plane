import { Suspense } from 'react';
import { ApprovalsContent } from './approvals-content';

export default function ApprovalsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-slate-400">Human gates for approval-required tool calls.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading approvals…</p>}>
        <ApprovalsContent />
      </Suspense>
    </div>
  );
}
