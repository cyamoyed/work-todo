<template>
  <div class="select time-select" id="field-due-time-wrap">
    <input type="hidden" id="field-due-time" :value="modelValue || ''" @input="emit('update:modelValue', $event.target.value)" />
    <button
      type="button"
      id="btn-due-time"
      class="select-trigger"
      aria-haspopup="listbox"
      aria-label="截止时间（可选）"
      @click.stop="toggle"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.35" />
        <path d="M8 5v3.2l2 1.3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
      </svg>
      <span class="select-text" id="field-due-time-label" :class="{ 'is-placeholder': !modelValue }">{{ modelValue || '时间' }}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div class="select-pop time-pop" id="time-pop" :hidden="!ui.state.timePopOpen" role="listbox" aria-label="选择时间" @click.stop>
      <button
        v-for="v in options"
        :key="v || 'none'"
        type="button"
        class="select-option"
        :class="{ active: v === (modelValue || '') }"
        role="option"
        @click="pick(v)"
      >{{ v || '不设置' }}</button>
    </div>
  </div>
</template>

<script setup>
import { useUiStore } from '../store/ui.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const ui = useUiStore();

const options = ['', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

function toggle() {
  ui.state.timePopOpen = !ui.state.timePopOpen;
  ui.state.projectPopOpen = false;
}

function pick(v) {
  emit('update:modelValue', v);
  ui.state.timePopOpen = false;
}
</script>
