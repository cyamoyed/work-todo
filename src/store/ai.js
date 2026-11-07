/* work-todo — AI 标题识别配置（work-todo.ai.v1，localStorage-persisted）
 *
 * OpenAI 兼容接口三元组（baseUrl / apiKey / model）+ enabled 开关。
 * 密钥默认仅存本机；用户显式开启 syncAi 后，配置 blob（含 updatedAt）随
 * 同步载荷上传/下发（engine 经 initSync 注入钩子读写，见 exportSyncBlob/
 * applySyncBlob），整包 LWW 以 updatedAt 裁决。
 */

import { reactive } from 'vue';
import { AI_KEY } from '../constants.js';
import { normalizeAiPayload } from '../core/ai.js';

const state = reactive({
  enabled: true, // 默认开启；未配置服务时 isReady() 仍为 false，不会发起请求
  baseUrl: '',
  apiKey: '',
  model: '',
  syncAi: false, // 「同步 AI 配置」——设备本地开关，不随 blob 传播
  updatedAt: '', // 内容字段（enabled/三元组）最近一次修改时间，blob LWW 胜负手
});

let inited = false;

function normalizeBaseUrl(v) {
  return typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '';
}

function readConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(
      AI_KEY,
      JSON.stringify({
        enabled: state.enabled,
        baseUrl: state.baseUrl,
        apiKey: state.apiKey,
        model: state.model,
        syncAi: state.syncAi,
        updatedAt: state.updatedAt,
      })
    );
  } catch (_) {
    /* ignore — AI 配置不持久化只影响下次启动 */
  }
}

export function useAiStore() {
  return {
    state,

    /** Idempotent: read persisted config into state（缺字段回默认值；enabled 缺省视为开启）。 */
    init() {
      if (inited) return;
      inited = true;
      const raw = readConfig();
      state.enabled = raw.enabled !== false;
      state.baseUrl = normalizeBaseUrl(raw.baseUrl);
      state.apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : '';
      state.model = typeof raw.model === 'string' ? raw.model.trim() : '';
      state.syncAi = raw.syncAi === true;
      state.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
    },

    /** 合并写入并持久化（baseUrl 去尾斜杠、model trim）。内容字段的修改会
     *  重打 updatedAt（参与 blob LWW）；syncAi 是设备本地开关，不重打。 */
    configure(patch = {}) {
      let touched = false;
      if ('enabled' in patch) {
        state.enabled = patch.enabled === true;
        touched = true;
      }
      if ('baseUrl' in patch) {
        state.baseUrl = normalizeBaseUrl(patch.baseUrl);
        touched = true;
      }
      if ('apiKey' in patch) {
        state.apiKey = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : '';
        touched = true;
      }
      if ('model' in patch) {
        state.model = typeof patch.model === 'string' ? patch.model.trim() : '';
        touched = true;
      }
      if ('syncAi' in patch) state.syncAi = patch.syncAi === true;
      if (touched) state.updatedAt = new Date().toISOString();
      persist();
    },

    /** 开关 + 三元组齐全才参与拖入文本的标题识别。 */
    isReady() {
      return state.enabled && !!(state.baseUrl && state.apiKey && state.model);
    },

    /** 同步引擎推送用：开启「同步 AI 配置」且配置有过修改时返回 blob，否则 null
     *  （null = 本设备不参与 AI 配置同步，引擎既不下发也不携带）。 */
    exportSyncBlob() {
      if (!state.syncAi || !state.updatedAt) return null;
      return {
        enabled: state.enabled,
        baseUrl: state.baseUrl,
        apiKey: state.apiKey,
        model: state.model,
        updatedAt: state.updatedAt,
      };
    },

    /** 同步引擎下发用：整体落库（沿用 blob 自带 updatedAt，不改写本机时间戳，
     *  否则本机会在下一轮反向覆盖远端）。syncAi 开关不受远端影响。 */
    applySyncBlob(blob) {
      const clean = normalizeAiPayload(blob);
      if (!clean) return false;
      state.enabled = clean.enabled;
      state.baseUrl = normalizeBaseUrl(clean.baseUrl);
      state.apiKey = clean.apiKey;
      state.model = clean.model.trim();
      state.updatedAt = clean.updatedAt;
      persist();
      return true;
    },

    /** Test hook: back to fresh-boot state (also re-arms init). Keeps the
     *  persisted config — isolation comes from localStorage.clear(). */
    __resetForTests() {
      inited = false;
      state.enabled = true;
      state.baseUrl = '';
      state.apiKey = '';
      state.model = '';
      state.syncAi = false;
      state.updatedAt = '';
    },
  };
}
