/* work-todo — copy text to the clipboard (async API with a legacy fallback) */

/**
 * Copy `text` to the clipboard. Resolves true on success. Prefers
 * navigator.clipboard (may be missing or denied in embedded webviews), then
 * falls back to a hidden textarea + execCommand.
 */
export async function copyText(text) {
  if (typeof text !== 'string' || !text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    /* fall through to the legacy path */
  }
  try {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}
