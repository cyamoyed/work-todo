<template>
  <section class="filters" aria-label="筛选">
    <FilterDropdown
      label="状态"
      trigger-id="btn-status-filter"
      pop-id="status-filter"
      :open="ui.state.statusPopOpen"
      @update:open="ui.state.statusPopOpen = $event"
      :value="ui.state.filters.status"
      :options="statusOptions"
      :counts="counts"
      @change="onStatus"
    />
    <FilterDropdown
      label="优先级"
      trigger-id="btn-priority-filter"
      pop-id="priority-filter"
      :open="ui.state.priorityPopOpen"
      @update:open="ui.state.priorityPopOpen = $event"
      :value="ui.state.filters.priority"
      :options="priorityOptions"
      @change="onPriority"
    />
    <SortMenu />
    <button
      type="button"
      id="btn-clear-done"
      class="btn sm"
      :hidden="!hasDone || ui.state.selection.active"
      @click="ui.clearCompleted()"
    >清除已完成</button>
    <button type="button" id="btn-new" class="btn sm btn-primary" @click="createNew">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <span>新建任务</span>
    </button>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import FilterDropdown from './FilterDropdown.vue';
import SortMenu from './SortMenu.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { statusCounts } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'in-progress', label: '进行中' },
  { value: 'done', label: '已完成' },
];
const priorityOptions = [
  { value: 'all', label: '全部' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const counts = computed(() => statusCounts(tasks.state.tasks));
const hasDone = computed(() => tasks.state.tasks.some((t) => t.status === 'done'));

// 维度切换只走左侧导航——下拉仅过滤,不改路由
function onStatus(v) {
  ui.setFilters({ status: v });
}

function onPriority(v) {
  ui.setFilters({ priority: v });
}

function createNew() {
  ui.openTaskModal(null, document.getElementById('btn-new'));
}
</script>
