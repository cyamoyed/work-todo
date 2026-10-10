<template>
  <div class="theme-row" role="radiogroup" aria-label="界面主题">
    <span class="theme-label">主题</span>
    <div class="theme-opts">
      <button
        v-for="t in options"
        :key="t.value"
        type="button"
        class="theme-option"
        :data-value="t.value"
        role="radio"
        :aria-checked="theme.state.setting === t.value"
        :class="{ active: theme.state.setting === t.value }"
        @click="theme.setTheme(t.value)"
      >{{ t.label }}</button>
    </div>
  </div>
</template>

<script setup>
import { useThemeStore } from '../store/theme.js';

const theme = useThemeStore();
theme.init(); // idempotent — safe for the two mount points (side nav + drawer)

const options = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];
</script>
