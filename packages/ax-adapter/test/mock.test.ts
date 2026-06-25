import { describe, expect, it } from 'vitest';
import { PendingApprovalError } from '@axplane/policy';

describe('ax adapter package smoke', () => {
  it('can import policy error', () => {
    const err = new PendingApprovalError('00000000-0000-0000-0000-000000000000');
    expect(err.name).toBe('PendingApprovalError');
  });
});
