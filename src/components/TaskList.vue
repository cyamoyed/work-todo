<template>
  <div id="task-list" class="task-list" :class="{ 'is-selecting': ui.state.selection.active }" aria-live="polite">
    <!-- done view: only completed cards, no toggle bar (legacy renderList contract) -->
    <template v-if="viewMode === 'done'">
      <TaskItem v-for="t in doneList" :key="t.id" :task="t" />
    </template>
    <template v-else>
      <div v-if="!openList.length" class="empty-state empty">
        <template v-if="searching">
          <h2>没有匹配的任务</h2>
          <p>换个关键词试试，或清空搜索。</p>
        </template>
        <template v-else-if="ui.state.filters.shelved === 'only'">
          <h2>没有搁置的任务</h2>
          <p>多选后点「搁置」收进来的任务都在这里，随时可以批量恢复。</p>
        </template>
        <template v-else-if="ui.state.filters.projectId">
          <h2>这个项目里还没有任务</h2>
          <p>用上方输入框记一笔，会直接归入当前项目。</p>
        </template>
        <template v-else>
          <h2>从第一件事开始</h2>
          <p>用上方输入框记一笔，或点「新建任务」。</p>
          <button type="button" class="btn btn-primary" @click="createNew">新建任务</button>
        </template>
      </div>
      <TaskItem v-for="t in openList" :key="t.id" :task="t" />
      <div id="done-toggle-bar" class="collapse-bar done-toggle-bar" :hidden="!doneList.length">
        <button type="button" id="done-toggle" class="btn-pill" :hidden="!doneList.length" @click="toggleDone">
          {{ doneToggleLabel }}
        </button>
      </div>
      <template v-if="ui.state.doneExpanded">
        <TaskItem v-for="t in doneList" :key="t.id" :task="t" />
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import TaskItem from './TaskItem.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { visibleTasks } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();

const viewMode = computed(() => ui.state.viewMode);
const list = computed(() =>
  visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode)
);
const doneList = computed(() => list.value.filter((t) => t.status === 'done'));
const openList = computed(() => list.value.filter((t) => t.status !== 'done'));
const searching = computed(() => ui.state.filters.search.trim().length > 0);
const doneToggleLabel = computed(() =>
  ui.state.doneExpanded ? '收起已完成' : `已完成 ${doneList.value.length} 项 · 展开`
);

function toggleDone() {
  ui.setDoneExpanded(!ui.state.doneExpanded);
}

function createNew() {
  ui.openTaskModal(null);
}
</script>
