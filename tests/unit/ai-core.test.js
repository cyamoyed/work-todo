/* Unit tests — AI title pure logic: prompt building + response extraction. */
import { describe, it, expect } from 'vitest';
import {
  buildTitleMessages,
  buildVisionTitleMessages,
  extractTitle,
  normalizeAiPayload,
} from '../../src/core/ai.js';
import { AI_TEXT_MAX, TITLE_MAX } from '../../src/constants.js';

describe('buildTitleMessages', () => {
  it('builds a system + user pair from the raw text', () => {
    const messages = buildTitleMessages('给客户发项目排期\n附上里程碑表格');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('给客户发项目排期\n附上里程碑表格');
  });

  it('truncates the user text to AI_TEXT_MAX', () => {
    const long = 'A'.repeat(AI_TEXT_MAX + 500);
    const messages = buildTitleMessages(long);
    expect(messages[1].content).toHaveLength(AI_TEXT_MAX);
  });

  it('trims surrounding whitespace before checking emptiness', () => {
    expect(buildTitleMessages('   \n\t  ')).toBeNull();
  });

  it('returns null for blank / missing input', () => {
    expect(buildTitleMessages('')).toBeNull();
    expect(buildTitleMessages(null)).toBeNull();
    expect(buildTitleMessages(undefined)).toBeNull();
  });
});

describe('buildVisionTitleMessages', () => {
  const PNG = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

  it('builds system + vision user pair (image_url content array)', () => {
    const messages = buildVisionTitleMessages(PNG);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toEqual([
      { type: 'text', text: expect.any(String) },
      { type: 'image_url', image_url: { url: PNG } },
    ]);
  });

  it('rejects non-data URLs and blanks', () => {
    expect(buildVisionTitleMessages('https://example.com/a.png')).toBeNull();
    expect(buildVisionTitleMessages('data:image/')).toBeNull();
    expect(buildVisionTitleMessages('')).toBeNull();
    expect(buildVisionTitleMessages(null)).toBeNull();
  });
});

describe('extractTitle', () => {
  it('returns the plain content unchanged', () => {
    expect(extractTitle('整理季度复盘材料')).toBe('整理季度复盘材料');
  });

  it('strips surrounding quotes of all supported kinds', () => {
    expect(extractTitle('"整理季度复盘材料"')).toBe('整理季度复盘材料');
    expect(extractTitle('“整理季度复盘材料”')).toBe('整理季度复盘材料');
    expect(extractTitle('「整理季度复盘材料」')).toBe('整理季度复盘材料');
    expect(extractTitle("'整理季度复盘材料'")).toBe('整理季度复盘材料');
  });

  it('takes the first non-empty line', () => {
    expect(extractTitle('\n  整理季度复盘材料  \n附：上季度数据')).toBe('整理季度复盘材料');
  });

  it('caps at TITLE_MAX', () => {
    expect(extractTitle('A'.repeat(TITLE_MAX + 50))).toHaveLength(TITLE_MAX);
  });

  it('returns empty for blank / quote-only content', () => {
    expect(extractTitle('')).toBe('');
    expect(extractTitle('  \n ')).toBe('');
    expect(extractTitle('“”')).toBe('');
  });
});

describe('normalizeAiPayload', () => {
  const VALID = {
    enabled: true,
    baseUrl: 'https://ai.test/v1',
    apiKey: 'sk',
    model: 'm',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a well-formed blob (empty content fields = cleared config, still valid)', () => {
    expect(normalizeAiPayload(VALID)).toEqual(VALID);
    const cleared = { ...VALID, enabled: false, baseUrl: '', apiKey: '', model: '' };
    expect(normalizeAiPayload(cleared)).toEqual(cleared);
  });

  it('rejects non-objects and wrong field types', () => {
    expect(normalizeAiPayload(null)).toBe(null);
    expect(normalizeAiPayload([VALID])).toBe(null);
    expect(normalizeAiPayload('blob')).toBe(null);
    expect(normalizeAiPayload({ ...VALID, enabled: 'yes' })).toBe(null);
    expect(normalizeAiPayload({ ...VALID, apiKey: null })).toBe(null);
    expect(normalizeAiPayload({ ...VALID, updatedAt: '' })).toBe(null);
    expect(normalizeAiPayload({ ...VALID, updatedAt: 5 })).toBe(null);
  });

  it('rebuilds from a whitelist (unknown fields dropped)', () => {
    const cleaned = normalizeAiPayload({ ...VALID, evil: 'x', __proto__: { injected: true } });
    expect(cleaned).toEqual(VALID);
    expect(cleaned).not.toHaveProperty('evil');
  });
});
