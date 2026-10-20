<template>
  <div id="task-list" class="task-list" aria-live="polite">
    <div class="review-block">
      <div class="day-head">
        <h3>本周已完成（{{ rangeLabel }}）</h3>
        <div class="hint">{{ done.length }} 项</div>
      </div>
      <div class="review-empty" v-if="!done.length">本周还没有完成的任务。推进中的事项仍在「今天 / 本周」视图。</div>
      <div class="review-day" v-for="g in doneGroups" :key="g.key">
        <div class="review-day-label">{{ g.label }}</div>
        <div class="review-item" v-for="t in g.items" :key="t.id" :data-id="t.id" @click="edit(t.id)">
          <span class="status-toggle st-done" aria-hidden="true"></span>
          <div class="review-main">
            <div class="task-title">{{ t.title }}</div>
            <div class="task-notes" v-if="t.notes">{{ t.notes }}</div>
          </div>
          <span class="when">{{ clock(t.completedAt || t.updatedAt) }}</span>
        </div>
      </div>
    </div>

    <div class="review-block" v-if="openWeek.length">
      <div class="day-head">
        <h3>仍在推进</h3>
        <div class="hint">{{ openWeek.length }} 项</div>
      </div>
      <TaskItem v-for="t in openWeek" :key="t.id" :task="t" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import TaskItem from './TaskItem.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { reviewBlocks, visibleTasks } from '../core/filters.js';
import { dayDiff, isoToLocalDateStr, pad2, parseDateStr, shortDay } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();

const blocks = computed(() => reviewBlocks(tasks.state.tasks));
const week = computed(() => blocks.value.week);
const done = computed(() => blocks.value.done);
const openWeek = computed(() =>
  visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode).filter((t) => t.status !== 'done')
);

/** 2026-10-19 → 「10 月 19 日」，避免在标题里出现裸 ISO 日期 */
function md(dateStr) {
  const p = parseDateStr(dateStr);
  return `${p.m + 1} 月 ${p.d} 日`;
}
const rangeLabel = computed(() => `${md(week.value.start)} – ${md(week.value.end)}`);

/** 已完成记录按完成日分段；输入已按完成时间倒序，分组顺序随之保持 */
const doneGroups = computed(() => {
  const byDay = new Map();
  for (const t of done.value) {
    const key = isoToLocalDateStr(t.completedAt || t.updatedAt || '');
    let g = byDay.get(key);
    if (!g) {
      const diff = dayDiff(key);
      const rel = diff === 0 ? '今天' : diff === -1 ? '昨天' : '';
      g = { key, label: rel ? `${rel} · ${shortDay(diff)}` : shortDay(diff), items: [] };
      byDay.set(key, g);
    }
    g.items.push(t);
  }
  return [...byDay.values()];
});

/** 完成时刻只展示时:分（段标题已给出日期；输入与分组同源，已通过日期解析） */
function clock(iso) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function edit(id) {
  ui.openTaskModal(id);
}
</script>
