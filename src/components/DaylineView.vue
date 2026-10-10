<template>
  <div id="task-list" class="task-list" aria-live="polite">
    <template v-for="g in groups" :key="g.key">
      <div class="day-group" v-if="g.items.length">
        <div class="day-head">
          <h3 :class="g.cls">{{ g.title }}</h3>
          <div class="hint">{{ g.items.length }} 项</div>
        </div>
        <div class="day-item" v-for="t in g.items" :key="t.id" :data-id="t.id">
          <button
            type="button"
            class="day-time"
            :class="{ late: isOverdue(t) }"
            :aria-label="`修改截止：${timeText(t)}`"
            @click.stop="openDue($event, t.id)"
          >{{ timeText(t) }}</button>
          <button
            type="button"
            class="status-toggle"
            :class="'st-' + t.status"
            :title="`状态：${STATUS_LABELS[t.status]} · 点击${t.status === 'done' ? '标记为待办' : '标记为已完成'} · 右键选择状态`"
            :aria-label="t.status === 'done' ? '标记为待办' : '标记为已完成'"
            aria-haspopup="menu"
            @click.stop="checkClick(t)"
            @contextmenu.prevent.stop="openStatus($event, t.id)"
          ></button>
          <div class="task-main">
            <div class="task-title" @click="edit(t.id)">{{ t.title }}</div>
            <div class="task-notes" v-if="t.notes">{{ t.notes }}</div>
            <div class="task-tags" v-if="t.tags && t.tags.length">
              <span class="tag" v-for="tag in t.tags" :key="tag">{{ tag }}</span>
            </div>
          </div>
          <button
            type="button"
            class="task-col-prio"
            :aria-label="`修改优先级：${PRIORITY_LABELS[t.priority]}`"
            @click.stop="openPrio($event, t.id)"
          >
            <span class="prio-dot" :class="'prio-' + t.priority"></span>
            {{ PRIORITY_LABELS[t.priority] }}
          </button>
        </div>
      </div>
    </template>
    <div v-if="!list.length" class="empty-state empty">
      <template v-if="searching">
        <h2>没有匹配的任务</h2>
        <p>换个关键词试试，或清空搜索。</p>
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
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useStatusChange } from '../composables/useStatusChange.js';
import { groupDayline, visibleTasks, sortTasks } from '../core/filters.js';
import { formatDue, isOverdue } from '../core/dates.js';
import { PRIORITY_LABELS, STATUS_LABELS } from '../constants.js';

const tasks = useTaskStore();
const ui = useUiStore();
const { requestSetStatus } = useStatusChange();

const list = computed(() =>
  sortTasks(
    visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode).filter((t) => t.status !== 'done'),
    ui.state.sortMode
  )
);
const groups = computed(() => groupDayline(list.value));
const searching = computed(() => ui.state.filters.search.trim().length > 0);

function timeText(t) {
  return t.dueTime || (isOverdue(t) ? String(formatDue(t) || '') : '全天');
}

function edit(id) {
  ui.openTaskModal(id);
}

function createNew() {
  ui.openTaskModal(null);
}

function openStatus(event, id) {
  ui.openStatusMenu(event.currentTarget, id);
}

/** Left check: complete (with confirm) / un-complete. */
function checkClick(t) {
  requestSetStatus(t, t.status === 'done' ? 'todo' : 'done');
}

function openPrio(event, id) {
  ui.openPrioMenu(event.currentTarget, id);
}

function openDue(event, id) {
  ui.openDueMenu(event.currentTarget, id);
}
</script>
