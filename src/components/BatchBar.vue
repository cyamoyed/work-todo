<template>
  <div v-if="ui.state.selection.active" id="batch-bar" role="toolbar" aria-label="批量操作" @click.stop>
    <span class="batch-count">已选 {{ ids.length }} 项</span>

    <div class="pop-anchor">
      <button type="button" class="btn sm" :disabled="!ids.length" @click="toggleMenu('status')">状态</button>
      <div v-if="ui.state.batchMenu === 'status'" class="batch-bar-pop">
        <button
          v-for="st in STATUS_CYCLE"
          :key="st"
          type="button"
          class="row-menu-item"
          @click="pickStatus(st)"
        ><span class="status-dot" :class="'st-' + st"></span>{{ STATUS_LABELS[st] }}</button>
      </div>
    </div>

    <div class="pop-anchor">
      <button type="button" class="btn sm" :disabled="!ids.length" @click="toggleMenu('prio')">优先级</button>
      <div v-if="ui.state.batchMenu === 'prio'" class="batch-bar-pop">
        <button
          v-for="p in priorities"
          :key="p.value"
          type="button"
          class="row-menu-item"
          @click="pickPriority(p.value)"
        ><span class="prio-dot" :class="'prio-' + p.value"></span>{{ p.label }}优先级</button>
      </div>
    </div>

    <div class="pop-anchor">
      <button type="button" class="btn sm" :disabled="!ids.length" @click="toggleMenu('due')">时间</button>
      <div v-if="ui.state.batchMenu === 'due'" class="batch-bar-pop">
        <button type="button" class="row-menu-item" @click="pickDue(quick.today, '今天')">今天</button>
        <button type="button" class="row-menu-item" @click="pickDue(quick.tomorrow, '明天')">明天</button>
        <button type="button" class="row-menu-item" @click="pickDue(quick.nextMonday, '下周一')">下周一</button>
        <button type="button" class="row-menu-item" @click="pickDue(null, '')">清除截止</button>
      </div>
    </div>

    <button
      type="button"
      class="btn sm btn-danger"
      :disabled="!ids.length"
      @click="confirmDelete"
    >删除</button>

    <button type="button" class="btn sm btn-ghost" @click="toggleAll">{{ allOn ? '全不选' : '全选' }}</button>
    <button type="button" class="btn sm btn-ghost" @click="ui.stopSelection()">退出</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { visibleTasks } from '../core/filters.js';
import { addDays, todayString, weekRange } from '../core/dates.js';
import { STATUS_CYCLE, STATUS_LABELS } from '../constants.js';

const tasks = useTaskStore();
const ui = useUiStore();

const priorities = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const ids = computed(() => ui.state.selection.ids);

const quick = computed(() => ({
  today: todayString(),
  tomorrow: addDays(todayString(), 1),
  nextMonday: addDays(weekRange().end, 1),
}));

/** Everything currently visible in the list (incl. the folded done section). */
const visibleIds = computed(() =>
  visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode).map((t) => t.id)
);

const allOn = computed(
  () => visibleIds.value.length > 0 && ids.value.length === visibleIds.value.length
);

function toggleMenu(kind) {
  ui.state.batchMenu === kind ? ui.closeBatchMenu() : ui.openBatchMenu(kind);
}

function toggleAll() {
  allOn.value ? ui.selectAll([]) : ui.selectAll(visibleIds.value);
}

/** Every batch mutation clears the selection but stays in select mode. */
function pickStatus(st) {
  ui.closeBatchMenu();
  const picked = ids.value.slice();
  const apply = () => applyBatch(picked, { status: st }, `已标记 ${picked.length} 项为${STATUS_LABELS[st]}`);
  if (st === 'done') {
    ui.openConfirmCustom(`将 ${picked.length} 项任务标记为已完成？`, apply);
  } else {
    apply();
  }
}

function pickPriority(value) {
  ui.closeBatchMenu();
  const picked = ids.value.slice();
  applyBatch(picked, { priority: value }, `已设为${value === 'high' ? '高' : value === 'medium' ? '中' : '低'}优先级 · ${picked.length} 项`);
}

function pickDue(dateStr, label) {
  ui.closeBatchMenu();
  const picked = ids.value.slice();
  const patch = dateStr ? { dueDate: dateStr } : { dueDate: null, dueTime: null };
  applyBatch(picked, patch, dateStr ? `截止已设为${label} · ${picked.length} 项` : `已清除截止 · ${picked.length} 项`);
}

function applyBatch(picked, patch, message) {
  const { cloned } = tasks.batchUpdateTasks(picked, patch);
  ui.selectAll([]);
  ui.showToast(cloned ? `${message}，已生成 ${cloned} 项重复任务` : message);
}

function confirmDelete() {
  ui.closeBatchMenu();
  const picked = ids.value.slice();
  if (!picked.length) return;
  ui.openConfirmCustom(`将删除 ${picked.length} 项任务。删除后 15 秒内可撤销。`, () => {
    const snapshot = picked
      .map((id) => tasks.getTask(id))
      .filter(Boolean)
      .map((t) => ({ ...t }));
    const removed = tasks.removeTasks(picked);
    ui.selectAll([]);
    ui.showToast(`已删除 ${removed} 项`, '撤销', () => {
      tasks.restoreTasks(snapshot);
    });
  });
}
</script>
