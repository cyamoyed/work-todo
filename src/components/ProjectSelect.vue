<template>
  <div class="select" id="field-project-wrap" data-select>
    <input type="hidden" id="field-project" :value="modelValue || ''" @input="emit('update:modelValue', $event.target.value)" />
    <button
      type="button"
      class="select-trigger"
      id="btn-project"
      aria-haspopup="listbox"
      aria-labelledby="project-label"
      @click.stop="toggle"
    >
      <span class="select-text" id="field-project-label" :class="{ 'is-placeholder': !current }">{{ current ? current.name : '无项目' }}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div class="select-pop" id="project-pop" :hidden="!ui.state.projectPopOpen" role="listbox" aria-label="选择项目" @click.stop>
      <button
        v-for="p in options"
        :key="p.id || 'none'"
        type="button"
        class="select-option"
        :class="{ active: (p.id || '') === (modelValue || '') }"
        role="option"
        @click="pick(p.id || '')"
      >
        <span class="swatch" :class="'dotc-' + p.color"></span>
        <span>{{ p.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, watch } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { clampWithinContainer } from '../composables/usePopupPlacement.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const tasks = useTaskStore();
const ui = useUiStore();

const options = computed(() => [{ id: '', name: '无项目', color: 'slate' }].concat(tasks.state.projects));
const current = computed(() => (props.modelValue ? tasks.getProject(props.modelValue) : null));

watch(
  () => ui.state.projectPopOpen,
  (open) => {
    nextTick(() => {
      const pop = document.getElementById('project-pop');
      if (open && pop) clampWithinContainer(pop, pop.closest('.modal'));
    });
  }
);

function toggle() {
  ui.state.projectPopOpen = !ui.state.projectPopOpen;
  ui.state.timePopOpen = false;
}

function pick(id) {
  emit('update:modelValue', id);
  ui.state.projectPopOpen = false;
}
</script>
