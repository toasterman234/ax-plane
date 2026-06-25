import { Suspense } from 'react';
import { ForgeWizard } from './forge-wizard';

export default function AgentsForgePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading forge…</p>}>
      <ForgeWizard />
    </Suspense>
  );
}
