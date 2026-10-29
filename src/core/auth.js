/* work-todo — pure auth-token helpers (JWT expiry math for sync re-auth).
 *
 * PocketBase auth tokens are JWTs carrying an `exp` claim. The sync engine
 * renews them before expiry (`auth-refresh`) and silently re-logs-in with the
 * on-device password once a token is dead, so a session never "falls out" of
 * login after running for a long time. No DOM / I/O here — unit-tested pure.
 */

/** Renew a token this long before its `exp` (24h). */
export const TOKEN_RENEW_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * Parse the `exp` claim (JWT seconds) out of a token and return it as epoch
 * milliseconds. Returns null when the payload or `exp` is missing/unreadable —
 * such tokens are treated as non-expiring.
 */
export function tokenExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  const exp = payload && payload.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

/**
 * True when the token should be renewed before its next use: already expired
 * or within `marginMs` of expiring. Tokens without a readable `exp` claim
 * never trigger renewal.
 */
export function shouldRenewToken(token, now = Date.now(), marginMs = TOKEN_RENEW_MARGIN_MS) {
  const exp = tokenExpiryMs(token);
  if (exp == null) return false;
  return exp - now < marginMs;
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch (_) {
    return null;
  }
}
