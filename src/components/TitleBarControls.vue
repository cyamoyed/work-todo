<template>
  <div v-if="desktop" class="win-controls">
    <button type="button" class="win-btn" title="最小化" aria-label="最小化窗口" @click="minimizeWindow">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
    <button type="button" class="win-btn" :title="maximized ? '还原' : '最大化'" :aria-label="maximized ? '还原窗口' : '最大化窗口'" @click="toggleMaximizeWindow">
      <svg v-if="!maximized" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect x="1.75" y="3.75" width="6.5" height="6.5" rx="1" stroke="currentColor" stroke-width="1.2" />
        <path d="M4 3.5V3a1.25 1.25 0 0 1 1.25-1.25H9A1.25 1.25 0 0 1 10.25 3v3.75A1.25 1.25 0 0 1 9 8h-.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
    <button type="button" class="win-btn win-close" title="关闭" aria-label="关闭窗口" @click="closeWindow">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import {
  isTauri,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
  onWindowResized,
} from '../lib/tauri.js';

const desktop = isTauri();
const maximized = ref(false);
let unlisten = null;

onMounted(async () => {
  if (!desktop) return;
  maximized.value = await isWindowMaximized();
  const stop = await onWindowResized(async () => {
    maximized.value = await isWindowMaximized();
  });
  unlisten = stop;
});

onBeforeUnmount(() => {
  if (unlisten) unlisten();
});
</script>
