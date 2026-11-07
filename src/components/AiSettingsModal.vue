<template>
  <div id="ai-backdrop" class="modal-backdrop" :hidden="!ui.state.aiModalOpen" @click.self="close">
    <div id="ai-modal" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
      <div class="modal-header">
        <h2 id="ai-modal-title">AI 设置</h2>
        <button type="button" class="modal-close" id="btn-close-ai" aria-label="关闭" @click="close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <form id="ai-form" autocomplete="off" novalidate @submit.prevent="submit">
        <label class="field">
          <span class="field-label">服务地址</span>
          <input
            id="field-ai-url"
            name="ai-endpoint"
            type="text"
            placeholder="https://api.deepseek.com/v1"
            autocomplete="off"
            v-model="url"
          />
        </label>

        <label class="field">
          <span class="field-label">API Key</span>
          <input id="field-ai-key" name="ai-secret" type="password" autocomplete="new-password" v-model="apiKey" />
        </label>

        <label class="field">
          <span class="field-label">模型</span>
          <input
            id="field-ai-model"
            name="ai-model-name"
            type="text"
            placeholder="deepseek-chat"
            autocomplete="off"
            v-model="model"
          />
        </label>

        <label class="field sync-check">
          <input
            id="field-ai-sync"
            type="checkbox"
            class="sync-check-input"
            :checked="ai.state.syncAi"
            @change="ai.configure({ syncAi: !ai.state.syncAi })"
          />
          <span class="sync-check-box" aria-hidden="true"></span>
          <span>同步 AI 配置到其他设备（密钥会随任务数据上传到同步服务）</span>
        </label>

        <p class="sync-note">
          填写任意 OpenAI 兼容接口（DeepSeek、智谱、Kimi 等）。请求只在拖入或粘贴内容时发起；密钥默认仅保存在本机，勾选同步后才随任务数据上传。图片识别使用同一模型，需该模型支持视觉（如 glm-4v-flash、gpt-4o-mini）。
        </p>

        <div class="modal-actions">
          <button type="button" id="btn-cancel-ai" class="btn btn-ghost" @click="close">取消</button>
          <button type="submit" id="btn-ai-save" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useUiStore } from '../store/ui.js';
import { useAiStore } from '../store/ai.js';

const ui = useUiStore();
const ai = useAiStore();

const url = ref('');
const apiKey = ref('');
const model = ref('');

watch(
  () => ui.state.aiModalOpen,
  (open) => {
    if (!open) return;
    ai.init();
    url.value = ai.state.baseUrl;
    apiKey.value = ai.state.apiKey;
    model.value = ai.state.model;
  }
);

function submit() {
  ai.configure({ baseUrl: url.value, apiKey: apiKey.value, model: model.value });
  ui.showToast('AI 设置已保存');
  close();
}

function close() {
  ui.closeAiModal();
}
</script>
