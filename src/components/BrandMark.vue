<template>
  <!-- 应用图标的微缩版(完整设计见 design/export-icon.js):小尺寸下三行清单不可辨,
       只保留墨面底 + 「已完成」靛青实心方框白勾这一个主 glyph -->
  <svg :width="size" :height="size" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect width="64" height="64" rx="14.5" fill="#18181B"/>
    <rect x="15" y="15" width="34" height="34" rx="3" fill="#6366F1"/>
    <path d="M24 32.5 30.5 39 41 25" stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</template>

<script setup>
defineProps({ size: { type: Number, default: 22 } });
</script>
