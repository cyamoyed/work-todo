<template>
  <div class="theme-row" role="radiogroup" aria-label="界面主题">
    <div class="theme-opts" :class="{ labeled: labels }">
      <button
        v-for="t in options"
        :key="t.value"
        type="button"
        class="theme-option"
        :data-value="t.value"
        role="radio"
        :aria-checked="theme.state.setting === t.value"
        :aria-label="t.label"
        :title="t.label"
        :class="{ active: theme.state.setting === t.value }"
        @click="theme.setTheme(t.value)"
      >
        <svg v-if="t.value === 'system'" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" stroke="currentColor" stroke-width="1.5" />
          <path d="M5.5 13.75h5M8 11.25v2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <svg v-else-if="t.value === 'light'" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2.75" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M8 1.25v1.9M8 12.85v1.9M1.25 8h1.9M12.85 8h1.9M3.4 3.4l1.34 1.34M11.26 11.26l1.34 1.34M12.6 3.4l-1.34 1.34M4.74 11.26l-1.34 1.34"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
          />
        </svg>
        <svg v-else width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2a4 4 0 0 0 6 6 6 6 0 1 1-6-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
        <span v-if="labels">{{ t.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useThemeStore } from '../store/theme.js';

defineProps({
  // 设置页带文字;侧边栏/抽屉保持纯图标(空间小)
  labels: { type: Boolean, default: false },
});

const theme = useThemeStore();
theme.init(); // idempotent — safe for the two mount points (side nav + drawer)

const options = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];
</script>
