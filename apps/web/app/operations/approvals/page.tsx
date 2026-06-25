import { Suspense } from 'react';
import { ApprovalsContent } from '../approvals-content';

export default function OperationsApprovalsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading approvals…</p>}>
      <ApprovalsContent />
    </Suspense>
  );
}
