<template>
  <section class="filters" aria-label="筛选">
    <div class="chipbar" id="range-filter" role="group" aria-label="时间范围">
      <button
        v-for="opt in rangeOptions"
        :key="opt.value"
        type="button"
        class="chip"
        :class="{ active: ui.state.filters.range === opt.value }"
        :data-value="opt.value"
        @click="onRange(opt.value)"
      >{{ opt.label }}</button>
    </div>
    <div class="chipbar" id="status-filter" role="group" aria-label="状态筛选">
      <button
        v-for="opt in statusOptions"
        :key="opt.value"
        type="button"
        class="chip"
        :class="{ active: ui.state.filters.status === opt.value }"
        :data-value="opt.value"
        @click="onStatus(opt.value)"
      >{{ opt.label }} <span class="chip-count" :data-count="opt.value">{{ counts[opt.value] }}</span></button>
    </div>
    <div class="chipbar" id="priority-filter" role="group" aria-label="优先级筛选">
      <button
        type="button"
        class="chip"
        :class="{ active: ui.state.filters.priority === 'all' }"
        data-value="all"
        @click="onPriority('all')"
      >优先级</button>
      <button
        v-for="opt in priorityOptions"
        :key="opt.value"
        type="button"
        class="chip prio"
        :class="[opt.cls, { active: ui.state.filters.priority === opt.value }]"
        :data-value="opt.value"
        @click="onPriority(opt.value)"
      ><i></i>{{ opt.label }}</button>
    </div>
    <div class="toolbar-right">
      <SortMenu />
      <button
        type="button"
        id="btn-batch"
        class="btn sm"
        :class="{ 'btn-primary': ui.state.selection.active }"
        :hidden="!batchable"
        :aria-pressed="ui.state.selection.active"
        @click="toggleBatch"
      >{{ ui.state.selection.active ? '退出批量' : '批量' }}</button>
      <button
        type="button"
        id="btn-clear-done"
        class="btn sm"
        :hidden="!hasDone || ui.state.selection.active"
        @click="ui.clearCompleted()"
      >清除已完成</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import SortMenu from './SortMenu.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useFilterChips } from '../composables/useFilterChips.js';
import { statusCounts } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();
const { onRange, onStatus, onPriority } = useFilterChips();

const rangeOptions = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'all', label: '全部' },
];
const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'in-progress', label: '进行中' },
  { value: 'done', label: '已完成' },
];
const priorityOptions = [
  { value: 'high', label: '高', cls: 'high' },
  { value: 'medium', label: '中', cls: 'medium' },
  { value: 'low', label: '低', cls: 'low' },
];

const counts = computed(() => statusCounts(tasks.state.tasks));
const hasDone = computed(() => tasks.state.tasks.some((t) => t.status === 'done'));
// multi-select operates on the flat list views only (dayline/review have no rows grid)
const batchable = computed(() => !['dayline', 'review'].includes(ui.state.viewMode));

function toggleBatch() {
  if (ui.state.selection.active) ui.stopSelection();
  else ui.startSelection();
}
</script>
