<template>
  <Teleport to="body">
    <div
      v-if="ui.state.dueMenu.open"
      ref="rootEl"
      class="row-menu due-menu"
      :style="{ position: 'absolute', top: ui.state.dueMenu.top + 'px', left: ui.state.dueMenu.left + 'px' }"
      @click.stop
    >
      <div class="due-quick">
        <button type="button" class="chip" @click.stop="setDate(quick.today)">今天</button>
        <button type="button" class="chip" @click.stop="setDate(quick.tomorrow)">明天</button>
        <button type="button" class="chip" @click.stop="setDate(quick.nextMonday)">下周一</button>
        <button type="button" class="chip" @click.stop="clearDue">清除</button>
      </div>
      <label class="due-field">
        <span>日期</span>
        <input type="date" class="due-input" :value="dueDate" @change="onDate" />
      </label>
      <label class="due-field">
        <span>时间</span>
        <input type="time" class="due-input" :value="dueTime" @change="onTime" />
      </label>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { placeMenuInViewport } from '../composables/usePopupPlacement.js';
import { addDays, formatDue, todayString, weekRange } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();

const rootEl = ref(null);

watch(
  () => ui.state.dueMenu.open,
  (open) => {
    if (open) {
      nextTick(() => {
        placeMenuInViewport(rootEl.value, ui.state.dueMenu.anchor, ui.state.dueMenu);
      });
    }
  }
);

const task = computed(() => tasks.getTask(ui.state.dueMenu.taskId));
const dueDate = computed(() => (task.value && task.value.dueDate) || '');
const dueTime = computed(() => (task.value && task.value.dueTime) || '');

const quick = computed(() => ({
  today: todayString(),
  tomorrow: addDays(todayString(), 1),
  nextMonday: addDays(weekRange().end, 1),
}));

/** Row list can re-sort under the menu after a change — close on every pick. */
function patchDue(patch, toast) {
  const t = task.value;
  ui.closeDueMenu();
  if (!t) return;
  const next = tasks.updateTask(t.id, patch);
  if (next) ui.showToast(typeof toast === 'function' ? toast(next) : toast);
}

function setDate(dateStr) {
  patchDue({ dueDate: dateStr }, (next) => `截止：${formatDue(next)}`);
}

function clearDue() {
  patchDue({ dueDate: null, dueTime: null }, '已清除截止时间');
}

function onDate(e) {
  const v = e.target.value || null;
  patchDue({ dueDate: v }, (next) => (next.dueDate ? `截止：${formatDue(next)}` : '已清除截止时间'));
}

function onTime(e) {
  const v = e.target.value || null;
  patchDue({ dueTime: v }, (next) => (next.dueTime ? `时间：${next.dueTime}` : '已清除时间'));
}
</script>
