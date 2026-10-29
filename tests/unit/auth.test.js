/* Unit tests — JWT expiry helpers used for sync token renewal (core/auth.js). */
import { describe, it, expect } from 'vitest';
import {
  tokenExpiryMs,
  shouldRenewToken,
  TOKEN_RENEW_MARGIN_MS,
} from '../../src/core/auth.js';

/** Build an unsigned JWT with the given payload (base64url, like the real thing). */
function makeJwt(payload) {
  const enc = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`;
}

describe('tokenExpiryMs', () => {
  it('reads the exp claim (JWT seconds) as epoch milliseconds', () => {
    expect(tokenExpiryMs(makeJwt({ exp: 1700000000 }))).toBe(1700000000 * 1000);
    expect(tokenExpiryMs(makeJwt({ exp: 0 }))).toBe(0);
  });

  it('returns null for tokens without a readable exp claim', () => {
    expect(tokenExpiryMs(makeJwt({ iat: 1700000000 }))).toBe(null);
    expect(tokenExpiryMs(makeJwt({ exp: 'soon' }))).toBe(null);
    expect(tokenExpiryMs('garbage')).toBe(null);
    expect(tokenExpiryMs('a.!!!.c')).toBe(null);
    expect(tokenExpiryMs('')).toBe(null);
    expect(tokenExpiryMs(null)).toBe(null);
    expect(tokenExpiryMs(undefined)).toBe(null);
  });
});

describe('shouldRenewToken', () => {
  const now = 1700000000000; // epoch ms
  const secs = now / 1000;

  it('keeps a fresh token alone', () => {
    expect(shouldRenewToken(makeJwt({ exp: secs + 7 * 24 * 3600 }), now)).toBe(false);
    expect(shouldRenewToken(makeJwt({ exp: secs + 25 * 3600 }), now)).toBe(false);
  });

  it('renews when expiry falls inside the margin', () => {
    expect(shouldRenewToken(makeJwt({ exp: secs + 3600 }), now)).toBe(true);
  });

  it('renews an already expired token', () => {
    expect(shouldRenewToken(makeJwt({ exp: secs - 1 }), now)).toBe(true);
    expect(shouldRenewToken(makeJwt({ exp: secs - 30 * 24 * 3600 }), now)).toBe(true);
  });

  it('never renews tokens without an exp claim', () => {
    expect(shouldRenewToken(makeJwt({ iat: secs }), now)).toBe(false);
    expect(shouldRenewToken('garbage', now)).toBe(false);
    expect(shouldRenewToken(null, now)).toBe(false);
  });

  it('honors a custom margin', () => {
    const tok = makeJwt({ exp: secs + 7200 });
    expect(shouldRenewToken(tok, now, 3600 * 1000)).toBe(false);
    expect(shouldRenewToken(tok, now, TOKEN_RENEW_MARGIN_MS)).toBe(true);
  });
});
