<template>
  <Teleport to="body">
    <div
      v-if="ui.state.infoMenu.open"
      ref="rootEl"
      class="row-menu info-menu"
      role="menu"
      aria-label="任务详情"
      :style="{ position: 'absolute', top: ui.state.infoMenu.top + 'px', left: ui.state.infoMenu.left + 'px' }"
      @click.stop
    >
      <div class="info-row">
        <span class="info-label">创建时间</span>
        <span class="info-value" data-field="created">{{ createdText }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">完成时间</span>
        <span class="info-value" data-field="completed">{{ completedText }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { placeMenuInViewport } from '../composables/usePopupPlacement.js';
import { formatIsoStamp } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();

const rootEl = ref(null);

watch(
  () => ui.state.infoMenu.open,
  (open) => {
    if (open) {
      nextTick(() => {
        placeMenuInViewport(rootEl.value, ui.state.infoMenu.anchor, ui.state.infoMenu);
      });
    }
  }
);

const task = computed(() => tasks.getTask(ui.state.infoMenu.taskId));
const createdText = computed(() => formatIsoStamp(task.value && task.value.createdAt) || '—');
const completedText = computed(() => {
  const t = task.value;
  if (!t || t.status !== 'done') return '—';
  return formatIsoStamp(t.completedAt) || '—';
});
</script>
