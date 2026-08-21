import { describe, it, expect } from 'vitest';
import { isClaimStale, STALE_CLAIM_GRACE_SEC } from './alerts';

describe('isClaimStale', () => {
  const claimedAt = '2026-08-19T12:00:00Z';

  it('is not stale while still within the requested duration', () => {
    const now = new Date('2026-08-19T12:00:30Z'); // 30s in, 60s requested
    expect(isClaimStale(claimedAt, 60, now)).toBe(false);
  });

  it('is not stale within the grace period after the requested duration', () => {
    const now = new Date(new Date(claimedAt).getTime() + (60 + STALE_CLAIM_GRACE_SEC - 1) * 1000);
    expect(isClaimStale(claimedAt, 60, now)).toBe(false);
  });

  it('is stale once past the requested duration plus the grace period', () => {
    const now = new Date(new Date(claimedAt).getTime() + (60 + STALE_CLAIM_GRACE_SEC + 1) * 1000);
    expect(isClaimStale(claimedAt, 60, now)).toBe(true);
  });
});
