<template>
  <article
    class="task-card"
    :class="{
      'is-done': task.status === 'done',
      'is-overdue': overdue,
      'is-selected': selected,
      ['prio-' + task.priority]: true,
    }"
    :data-id="task.id"
    @click="onCardClick"
  >
    <button
      v-if="selecting"
      type="button"
      class="select-check"
      :class="{ 'is-on': selected }"
      :aria-label="selected ? '取消选择任务' : '选择任务'"
      :aria-pressed="selected"
      @click.stop="toggleSelect"
    ></button>

    <div class="status-wrap">
      <button
        type="button"
        class="status-toggle"
        :class="'st-' + task.status"
        :title="checkTitle"
        :aria-label="checkLabel"
        aria-haspopup="menu"
        @click.stop="onCheckClick"
        @contextmenu.prevent.stop="openStatus"
      ></button>
    </div>

    <div class="task-main">
      <h3 class="task-title" @click="onTitleClick">{{ task.title }}</h3>
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

    <button
      type="button"
      class="task-col-status meta-status"
      :class="'st-' + task.status"
      :title="`状态：${STATUS_LABELS[task.status]} · 点击修改`"
      :aria-label="`修改状态：当前 ${STATUS_LABELS[task.status]}`"
      aria-haspopup="menu"
      @click.stop="openStatus"
      @contextmenu.prevent.stop="openStatus"
    >{{ STATUS_LABELS[task.status] }}</button>

    <button
      type="button"
      class="task-due due-chip"
      :class="{ 'is-overdue': dueOverdue, 'is-today': dueToday, 'is-empty': !dueText }"
      :aria-label="dueText ? `修改截止：${dueText}` : '设置截止时间'"
      @click.stop="openDue"
    >{{ dueText || '' }}</button>

    <div class="task-actions" v-if="!selecting">
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
const { requestSetStatus } = useStatusChange();

const selecting = computed(() => ui.state.selection.active);
const selected = computed(() => selecting.value && ui.isSelected(props.task.id));

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

const isDone = computed(() => props.task.status === 'done');
const checkLabel = computed(() =>
  isDone.value ? '标记为待办' : `标记为已完成（当前${STATUS_LABELS[props.task.status]}）`
);
const checkTitle = computed(
  () => `${checkLabel.value} · 右键选择状态`
);

function edit() {
  ui.openTaskModal(props.task.id);
}

function remove() {
  ui.openConfirmDelete(props.task.id);
}

/** Left check: complete (with confirm) / un-complete. */
function onCheckClick() {
  requestSetStatus(props.task, isDone.value ? 'todo' : 'done');
}

function openStatus(e) {
  ui.openStatusMenu(e.currentTarget, props.task.id);
}

function openPrio(e) {
  ui.openPrioMenu(e.currentTarget, props.task.id);
}

function openDue(e) {
  ui.openDueMenu(e.currentTarget, props.task.id);
}

/** Selection mode: any bare click on the row toggles selection. */
function onCardClick() {
  if (selecting.value) ui.toggleSelect(props.task.id);
}

/** Title edits normally; in selection mode the click falls through to the row. */
function onTitleClick() {
  if (!selecting.value) edit();
}

function toggleSelect() {
  ui.toggleSelect(props.task.id);
}
</script>
