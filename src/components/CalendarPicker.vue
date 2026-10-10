<template>
  <div class="date-picker" id="date-picker">
    <button
      type="button"
      id="btn-due"
      class="select-trigger"
      aria-haspopup="dialog"
      :aria-expanded="ui.state.calOpen ? 'true' : 'false'"
      aria-labelledby="due-label"
      @click.stop="toggle"
    >
      <svg class="date-trigger-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.35" />
        <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
      </svg>
      <span id="field-due-label" class="select-text" :class="{ 'is-placeholder': !modelValue, 'is-set': !!modelValue }">{{ dueLabel }}</span>
      <svg class="date-trigger-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <input type="hidden" id="field-due" name="dueDate" :value="modelValue || ''" @input="emit('update:modelValue', $event.target.value)" />
    <div class="calendar" id="calendar" :hidden="!ui.state.calOpen" role="dialog" aria-label="选择截止日期" @click.stop>
      <div class="calendar-header">
        <button type="button" class="cal-nav" id="cal-prev" aria-label="上一月" @click="prevMonth">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M8.5 3L4.5 7L8.5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="calendar-title" id="cal-title" aria-live="polite">{{ grid.title }}</div>
        <button type="button" class="cal-nav" id="cal-next" aria-label="下一月" @click="nextMonth">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M5.5 3L9.5 7L5.5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
      </div>
      <div class="calendar-grid" id="cal-grid" role="grid">
        <button
          v-for="cell in grid.cells"
          :key="cell.date"
          type="button"
          class="cal-day"
          :class="{ 'is-muted': cell.muted, 'is-today': cell.isToday, 'is-selected': cell.isSelected }"
          :data-date="cell.date"
          :aria-selected="cell.isSelected ? 'true' : undefined"
          @click.stop="pick(cell.date)"
        >{{ cell.d }}</button>
      </div>
      <div class="calendar-footer">
        <button type="button" class="cal-text-btn" id="cal-today" @click="pickToday">今天</button>
        <button type="button" class="cal-text-btn" id="cal-clear" @click="pickClear">清除</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, watch } from 'vue';
import { useUiStore } from '../store/ui.js';
import { buildCalendarCells } from '../core/calendar.js';
import { formatDueLabel, parseDateStr, todayString } from '../core/dates.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const ui = useUiStore();

const dueLabel = computed(() => formatDueLabel(props.modelValue || ''));

const grid = computed(() => {
  const today = new Date();
  return buildCalendarCells(
    ui.state.calCursor,
    props.modelValue || '',
    todayString()
  );
});

function toggle() {
  if (ui.state.calOpen) {
    ui.state.calOpen = false;
    return;
  }
  const current = parseDateStr(props.modelValue || '');
  if (current) ui.state.calCursor = { y: current.y, m: current.m };
  ui.state.calOpen = true;
  nextTick(() => {
    const cal = document.getElementById('calendar');
    if (!cal) return;
    const selectedBtn = cal.querySelector('.cal-day.is-selected') || cal.querySelector('.cal-day.is-today');
    if (selectedBtn && selectedBtn.focus) selectedBtn.focus();
  });
}

function prevMonth() {
  let { y, m } = ui.state.calCursor;
  m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  ui.state.calCursor = { y, m };
}

function nextMonth() {
  let { y, m } = ui.state.calCursor;
  m += 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  ui.state.calCursor = { y, m };
}

function pick(date) {
  emit('update:modelValue', date);
  ui.state.calOpen = false;
}

function pickToday() {
  emit('update:modelValue', todayString());
  ui.state.calOpen = false;
}

function pickClear() {
  emit('update:modelValue', '');
  ui.state.calOpen = false;
}
</script>
