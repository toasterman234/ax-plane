import { Suspense } from 'react';
import { ObservatoryView } from './observatory-view';

/**
 * `/observatory` — Observatory cockpit (issue #12, Slice B).
 *
 * `ObservatoryView` reads `useSearchParams`, so it is wrapped in a Suspense
 * boundary (Next 15 requirement for client search-param reads under the route).
 */
export default function ObservatoryPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading Observatory…</div>}>
      <ObservatoryView />
    </Suspense>
  );
}
