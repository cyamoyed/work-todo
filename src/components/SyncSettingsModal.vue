<template>
  <div id="sync-backdrop" class="modal-backdrop" :hidden="!ui.state.syncModalOpen" @click.self="close">
    <div id="sync-modal" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="sync-modal-title">
      <div class="modal-header">
        <h2 id="sync-modal-title">同步设置</h2>
        <button type="button" class="modal-close" id="btn-close-sync" aria-label="关闭" @click="close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <p v-if="syncState.configured" id="sync-current">
        当前：{{ providerLabel(syncState.provider) }} · {{ syncState.identity }} · {{ statusText }}
      </p>
      <p v-if="syncState.lastError" class="sync-error" id="sync-last-error" role="alert">
        上次错误：{{ syncState.lastError }}
      </p>

      <form id="sync-form" novalidate @submit.prevent="submit">
        <div class="field">
          <span class="field-label">同步方式</span>
          <div class="segmented" id="field-sync-provider" role="group" aria-label="同步方式">
            <button
              type="button"
              data-value="pocketbase"
              :class="{ active: provider === 'pocketbase' }"
              @click="provider = 'pocketbase'"
            >PocketBase 自建</button>
            <button
              type="button"
              data-value="webdav"
              :class="{ active: provider === 'webdav' }"
              @click="provider = 'webdav'"
            >WebDAV 网盘</button>
          </div>
        </div>

        <label class="field">
          <span class="field-label">{{ provider === 'pocketbase' ? '服务地址' : '文件地址' }}</span>
          <input
            id="field-sync-url"
            type="text"
            :placeholder="provider === 'pocketbase' ? 'https://pb.example.com' : 'https://dav.example.com/work-todo-sync.json'"
            autocomplete="off"
            v-model="url"
          />
        </label>

        <label class="field">
          <span class="field-label">{{ provider === 'pocketbase' ? '邮箱' : '账号' }}</span>
          <input id="field-sync-identity" type="text" autocomplete="username" v-model="identity" />
        </label>

        <label class="field">
          <span class="field-label">密码</span>
          <input id="field-sync-password" type="password" autocomplete="current-password" v-model="password" />
        </label>

        <label v-if="provider === 'pocketbase'" class="field">
          <span class="field-label">集合名称</span>
          <input
            id="field-sync-collection"
            type="text"
            :placeholder="DEFAULT_SYNC_COLLECTION"
            autocomplete="off"
            v-model="collection"
          />
        </label>

        <label v-if="provider === 'pocketbase'" class="field sync-check">
          <input id="field-sync-register" type="checkbox" class="sync-check-input" v-model="register" />
          <span class="sync-check-box" aria-hidden="true"></span>
          <span>创建新账号（首次使用）</span>
        </label>

        <p class="sync-note">
          {{ provider === 'pocketbase'
            ? '仅登录令牌保存在本机。服务端只需一个数据集合（默认 ' + DEFAULT_SYNC_COLLECTION + '）。'
            : '账号与密码保存在本机，用于访问网盘上的同步文件。' }}
        </p>

        <p v-if="error" class="field-error sync-error" id="sync-error" role="alert">{{ error }}</p>

        <div class="modal-actions">
          <button v-if="syncState.configured" type="button" id="btn-sync-logout" class="btn btn-ghost" @click="logout">
            退出登录
          </button>
          <button v-if="syncState.configured" type="button" id="btn-sync-now" class="btn btn-ghost" @click="syncNowClick">
            立即同步
          </button>
          <button type="button" id="btn-cancel-sync" class="btn btn-ghost" @click="close">取消</button>
          <button type="submit" id="btn-sync-login" class="btn btn-primary">登录并同步</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useUiStore } from '../store/ui.js';
import { syncState, syncStatusText } from '../store/sync.js';
import { configureSync, logoutSync, syncNow } from '../lib/sync/engine.js';
import { DEFAULT_SYNC_COLLECTION } from '../constants.js';

const ui = useUiStore();

const provider = ref('pocketbase');
const url = ref('');
const identity = ref('');
const password = ref('');
const collection = ref(DEFAULT_SYNC_COLLECTION);
const register = ref(false);
const error = ref('');

const statusText = computed(() => syncStatusText());

function providerLabel(p) {
  return p === 'webdav' ? 'WebDAV' : 'PocketBase';
}

watch(
  () => ui.state.syncModalOpen,
  (open) => {
    if (!open) return;
    error.value = '';
    password.value = '';
    register.value = false;
    try {
      const saved = JSON.parse(localStorage.getItem('work-todo.sync.v1') || '{}');
      if (saved.provider) provider.value = saved.provider;
      if (saved.url) url.value = saved.url;
      if (saved.identity) identity.value = saved.identity;
      collection.value = saved.collection || DEFAULT_SYNC_COLLECTION;
    } catch (_) {
      /* fresh form */
    }
  }
);

async function submit() {
  error.value = '';
  if (!url.value.trim() || !identity.value.trim() || !password.value) {
    error.value = '请填写服务地址、账号和密码';
    return;
  }
  try {
    await configureSync({
      provider: provider.value,
      url: url.value.trim(),
      identity: identity.value.trim(),
      password: password.value,
      register: register.value,
      collection: collection.value.trim() || DEFAULT_SYNC_COLLECTION,
    });
    ui.showToast('同步已开启');
    close();
  } catch (e) {
    error.value = (e && e.message) || '同步配置失败';
  }
}

async function syncNowClick() {
  error.value = '';
  const s = await syncNow();
  if (s.status === 'error') error.value = s.lastError || '同步失败';
  else if (s.status === 'offline') error.value = '当前离线，恢复网络后会自动重试';
}

function logout() {
  logoutSync();
  ui.showToast('已退出同步');
  close();
}

function close() {
  ui.closeSyncModal();
}
</script>
