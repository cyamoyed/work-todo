<template>
  <Teleport to="body">
    <div
      v-if="ui.state.statusMenu.open"
      ref="rootEl"
      class="status-menu"
      role="menu"
      :style="{ position: 'absolute', top: ui.state.statusMenu.top + 'px', left: ui.state.statusMenu.left + 'px' }"
    >
      <button
        v-for="st in STATUS_CYCLE"
        :key="st"
        type="button"
        class="status-menu-item"
        :class="{ 'is-current': st === currentStatus }"
        role="menuitem"
        :ref="st === STATUS_CYCLE[0] ? setFirstRef : undefined"
        @click.stop="pick(st)"
      >
        <span class="status-dot" :class="'st-' + st"></span>
        {{ STATUS_LABELS[st] }}
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useStatusChange } from '../composables/useStatusChange.js';
import { placeMenuInViewport } from '../composables/usePopupPlacement.js';
import { STATUS_CYCLE, STATUS_LABELS } from '../constants.js';

const tasks = useTaskStore();
const ui = useUiStore();
const { requestSetStatus } = useStatusChange();

const currentStatus = computed(() => {
  const task = tasks.getTask(ui.state.statusMenu.taskId);
  return task ? task.status : null;
});

const firstRef = ref(null);
function setFirstRef(el) {
  firstRef.value = el;
}

const rootEl = ref(null);

watch(
  () => ui.state.statusMenu.open,
  (open) => {
    if (open) {
      nextTick(() => {
        placeMenuInViewport(rootEl.value, ui.state.statusMenu.anchor, ui.state.statusMenu);
        if (firstRef.value && firstRef.value.focus) firstRef.value.focus();
      });
    }
  }
);

function pick(st) {
  const taskId = ui.state.statusMenu.taskId;
  const task = tasks.getTask(taskId);
  ui.closeStatusMenu();
  if (!task) return;
  // Completing goes through the shared confirm gate.
  requestSetStatus(task, st);
}
</script>
