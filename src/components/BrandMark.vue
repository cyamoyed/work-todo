<template>
  <!-- 应用图标的微缩版(完整设计见 design/app-icon.html):小尺寸下三行清单不可辨,只保留米纸底 + 绿勾圆 -->
  <svg :width="size" :height="size" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect width="64" height="64" rx="14.5" fill="#F4EDDE"/>
    <circle cx="32" cy="32" r="23" fill="#27A566"/>
    <path d="M21 32.5 29.5 41 44 24" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</template>

<script setup>
defineProps({ size: { type: Number, default: 22 } });
</script>
