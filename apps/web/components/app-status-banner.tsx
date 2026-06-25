'use client';

import { ApiStatusBanner } from '@/lib/api-health';

export function AppStatusBanner() {
  return (
    <div className="mb-6">
      <ApiStatusBanner />
    </div>
  );
}
