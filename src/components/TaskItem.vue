<template>
  <article
    class="task-card"
    :class="{ 'is-done': task.status === 'done', 'is-overdue': overdue, ['prio-' + task.priority]: true }"
    :data-id="task.id"
  >
    <div class="status-wrap">
      <button
        type="button"
        class="status-toggle"
        :class="'st-' + task.status"
        :title="`状态：${STATUS_LABELS[task.status]} · 点击切换到「${STATUS_LABELS[nextStatus]}」`"
        :aria-label="`切换状态：${STATUS_LABELS[task.status]} → ${STATUS_LABELS[nextStatus]}`"
        aria-haspopup="menu"
        @click.stop="advance"
        @contextmenu.prevent.stop="openStatus"
      ></button>
      <span class="status-label">{{ STATUS_LABELS[task.status] }}</span>
    </div>

    <div class="task-main">
      <h3 class="task-title" @click="edit">{{ task.title }}</h3>
      <p class="task-notes" v-if="hasNote">
        <template v-if="project && !ui.state.filters.projectId">
          <span class="proj-chip"><i :style="{ background: projectColor }"></i>{{ project.name }}</span>
          <span class="sep-dot" v-if="task.notes">·</span>
        </template>
        <template v-if="task.notes">{{ task.notes }}</template>
      </p>
      <div class="task-tags" v-if="task.tags && task.tags.length">
        <span class="tag" v-for="tag in task.tags" :key="tag">{{ tag }}</span>
      </div>
      <div class="task-repeat" v-if="task.repeat">{{ REPEAT_LABELS[task.repeat] || task.repeat }}</div>
    </div>

    <button
      type="button"
      class="task-col-prio"
      :aria-label="`修改优先级：${PRIORITY_LABELS[task.priority]}`"
      @click.stop="openPrio"
    >
      <span class="prio-dot" :class="'prio-' + task.priority"></span>
      {{ PRIORITY_LABELS[task.priority] }}优先级
    </button>

    <div class="task-col-status meta-status">{{ STATUS_LABELS[task.status] }}</div>

    <button
      type="button"
      class="task-due due-chip"
      :class="{ 'is-overdue': dueOverdue, 'is-today': dueToday, 'is-empty': !dueText }"
      :aria-label="dueText ? `修改截止：${dueText}` : '设置截止时间'"
      @click.stop="openDue"
    >{{ dueText || '' }}</button>

    <div class="task-actions">
      <button type="button" class="btn-icon" title="编辑任务" aria-label="编辑任务" @click.stop="edit">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.2 2.6l2.2 2.2L5.6 12.6 2.5 13.5l.9-3.1 7.8-7.8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button type="button" class="btn-icon danger" title="删除任务" aria-label="删除任务" @click.stop="remove">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.8 4.2h10.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5.4 4.2V2.8h5.2v1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4.3 4.2l.55 9h6.3l.55-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useStatusChange } from '../composables/useStatusChange.js';
import { formatDue, isDueTodayOpen, isOverdue } from '../core/dates.js';
import { PRIORITY_LABELS, REPEAT_LABELS, STATUS_LABELS, PROJECT_COLORS } from '../constants.js';

const props = defineProps({
  task: { type: Object, required: true },
});

const tasks = useTaskStore();
const ui = useUiStore();
const { nextStatus: nextStatusOf, advanceStatus } = useStatusChange();

const nextStatus = computed(() => nextStatusOf(props.task.status));

const project = computed(() => (props.task.projectId ? tasks.getProject(props.task.projectId) : null));
const projectColor = computed(
  () => PROJECT_COLORS[project.value ? project.value.color : 'slate'] || PROJECT_COLORS.slate
);
const hasNote = computed(() =>
  (!!project.value && !ui.state.filters.projectId) || !!props.task.notes
);
const overdue = computed(() => isOverdue(props.task));
const dueText = computed(() => formatDue(props.task));
const dueOverdue = computed(() => !!dueText.value && overdue.value);
const dueToday = computed(() => !!dueText.value && isDueTodayOpen(props.task) && !overdue.value);

function edit() {
  ui.openTaskModal(props.task.id);
}

function remove() {
  ui.openConfirmDelete(props.task.id);
}

function openStatus(e) {
  ui.openStatusMenu(e.currentTarget, props.task.id);
}

function advance() {
  advanceStatus(props.task.id);
}

function openPrio(e) {
  ui.openPrioMenu(e.currentTarget, props.task.id);
}

function openDue(e) {
  ui.openDueMenu(e.currentTarget, props.task.id);
}
</script>
