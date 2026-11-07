/* Unit tests — AI config store: persistence round-trip, normalization, readiness. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAiStore } from '../../src/store/ai.js';
import { AI_KEY } from '../../src/constants.js';

beforeEach(() => {
  localStorage.clear();
  useAiStore().__resetForTests();
});

describe('useAiStore', () => {
  it('defaults to enabled but unconfigured on fresh boot (no request without config)', () => {
    const ai = useAiStore();
    ai.init();
    expect(ai.state.enabled).toBe(true);
    expect(ai.isReady()).toBe(false);
  });

  it('round-trips config through localStorage', () => {
    const ai = useAiStore();
    ai.init();
    ai.configure({ enabled: true, baseUrl: 'https://api.example.com/v1', apiKey: 'sk', model: 'm1' });
    expect(JSON.parse(localStorage.getItem(AI_KEY)).apiKey).toBe('sk');

    useAiStore().__resetForTests();
    const fresh = useAiStore();
    fresh.init();
    expect(fresh.state.enabled).toBe(true);
    expect(fresh.state.baseUrl).toBe('https://api.example.com/v1');
    expect(fresh.state.model).toBe('m1');
    expect(fresh.isReady()).toBe(true);
  });

  it('normalizes baseUrl (trailing slashes) and trims model/key', () => {
    const ai = useAiStore();
    ai.init();
    ai.configure({ baseUrl: 'https://api.example.com/v1///', apiKey: ' sk ', model: ' m1 ' });
    expect(ai.state.baseUrl).toBe('https://api.example.com/v1');
    expect(ai.state.apiKey).toBe('sk');
    expect(ai.state.model).toBe('m1');
  });

  it('isReady requires enabled AND all three fields', () => {
    const ai = useAiStore();
    ai.init();
    ai.configure({ enabled: true, baseUrl: 'u', apiKey: 'k', model: 'm' });
    expect(ai.isReady()).toBe(true);
    ai.configure({ enabled: false });
    expect(ai.isReady()).toBe(false);
    ai.configure({ enabled: true, model: '' });
    expect(ai.isReady()).toBe(false);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(AI_KEY, '{not json');
    const ai = useAiStore();
    ai.init();
    expect(ai.state.enabled).toBe(true); // 缺省视为开启，字段回空
    expect(ai.state.baseUrl).toBe('');
  });
});

describe('AI config sync blob', () => {
  const BLOB = {
    enabled: true,
    baseUrl: 'https://ai.test/v1',
    apiKey: 'sk',
    model: 'm',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  it('syncAi defaults off and persists as a device-local switch', () => {
    const ai = useAiStore();
    ai.init();
    expect(ai.state.syncAi).toBe(false);
    ai.configure({ syncAi: true });
    expect(JSON.parse(localStorage.getItem(AI_KEY)).syncAi).toBe(true);
    useAiStore().__resetForTests();
    const fresh = useAiStore();
    fresh.init();
    expect(fresh.state.syncAi).toBe(true);
  });

  it('exportSyncBlob: null when off or never configured, blob when on', () => {
    const ai = useAiStore();
    ai.init();
    ai.configure({ baseUrl: 'u', apiKey: 'k', model: 'm' });
    expect(ai.exportSyncBlob()).toBe(null); // 未开启
    ai.configure({ syncAi: true });
    expect(ai.exportSyncBlob()).toEqual(
      expect.objectContaining({ baseUrl: 'u', apiKey: 'k', model: 'm' })
    );
    expect(typeof ai.exportSyncBlob().updatedAt).toBe('string');
    ai.configure({ syncAi: false });
    // 模拟全新安装：清存储 + 重置内存态后，仅开 syncAi 也没有可同步的内容
    localStorage.clear();
    useAiStore().__resetForTests();
    const fresh = useAiStore();
    fresh.init();
    fresh.configure({ syncAi: true });
    expect(fresh.exportSyncBlob()).toBe(null);
  });

  it('content changes stamp updatedAt; syncAi flips do not', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const ai = useAiStore();
    ai.init();
    ai.configure({ baseUrl: 'u', apiKey: 'k', model: 'm' });
    expect(ai.state.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    ai.configure({ syncAi: !ai.state.syncAi });
    expect(ai.state.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    ai.configure({ model: 'm2' });
    expect(ai.state.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    vi.useRealTimers();
  });

  it('applySyncBlob stores fields with the remote timestamp and keeps local syncAi', () => {
    const ai = useAiStore();
    ai.init();
    ai.configure({ syncAi: true, baseUrl: 'local', apiKey: 'local', model: 'local' });
    expect(ai.applySyncBlob(BLOB)).toBe(true);
    expect(ai.state.enabled).toBe(true);
    expect(ai.state.baseUrl).toBe('https://ai.test/v1');
    expect(ai.state.model).toBe('m');
    expect(ai.state.updatedAt).toBe(BLOB.updatedAt); // 沿用远端时间戳，不重打
    expect(ai.state.syncAi).toBe(true);
    expect(JSON.parse(localStorage.getItem(AI_KEY)).apiKey).toBe('sk');
  });

  it('applySyncBlob rejects invalid payloads', () => {
    const ai = useAiStore();
    ai.init();
    expect(ai.applySyncBlob({ baseUrl: 'x' })).toBe(false);
    expect(ai.applySyncBlob(null)).toBe(false);
    expect(ai.state.baseUrl).toBe('');
  });
});
