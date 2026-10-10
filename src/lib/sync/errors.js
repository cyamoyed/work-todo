/* WorkTodo — sync error taxonomy (shared by engine + providers) */

/** Remote version moved on; the engine re-pulls, re-merges and retries. */
export class SyncConflictError extends Error {
  constructor(message = '同步版本冲突') {
    super(message);
    this.name = 'SyncConflictError';
    this.isConflict = true;
  }
}

/** Credentials rejected / session expired. */
export class SyncAuthError extends Error {
  constructor(message = '同步登录已失效') {
    super(message);
    this.name = 'SyncAuthError';
    this.isAuthError = true;
  }
}

export function isConflict(e) {
  return !!(e && e.isConflict);
}

export function isAuthError(e) {
  return !!(e && e.isAuthError);
}
