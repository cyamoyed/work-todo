<template>
  <Teleport to="body">
    <div
      v-if="ui.state.prioMenu.open"
      ref="rootEl"
      class="row-menu prio-menu"
      role="menu"
      :style="{ position: 'absolute', top: ui.state.prioMenu.top + 'px', left: ui.state.prioMenu.left + 'px' }"
    >
      <button
        v-for="p in PRIORITIES"
        :key="p"
        type="button"
        class="row-menu-item"
        :class="{ 'is-current': p === currentPriority }"
        role="menuitem"
        @click.stop="pick(p)"
      >
        <span class="prio-dot" :class="'prio-' + p"></span>
        {{ PRIORITY_LABELS[p] }}
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { placeMenuInViewport } from '../composables/usePopupPlacement.js';
import { PRIORITY_LABELS } from '../constants.js';

const PRIORITIES = ['high', 'medium', 'low'];

const tasks = useTaskStore();
const ui = useUiStore();

const rootEl = ref(null);

watch(
  () => ui.state.prioMenu.open,
  (open) => {
    if (open) {
      nextTick(() => {
        placeMenuInViewport(rootEl.value, ui.state.prioMenu.anchor, ui.state.prioMenu);
      });
    }
  }
);

const currentPriority = computed(() => {
  const task = tasks.getTask(ui.state.prioMenu.taskId);
  return task ? task.priority : null;
});

function pick(p) {
  const taskId = ui.state.prioMenu.taskId;
  ui.closePrioMenu();
  const task = tasks.getTask(taskId);
  if (!task) return;
  tasks.updateTask(taskId, { priority: p });
  ui.showToast(`优先级：${PRIORITY_LABELS[p]}`);
}
</script>
