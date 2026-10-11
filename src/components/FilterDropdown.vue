<template>
  <div class="pop-anchor">
    <button
      type="button"
      :id="triggerId"
      class="btn sm filter-dd"
      :class="{ 'is-filtered': filtered }"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="popId"
      @click.stop="emit('update:open', !open)"
    >
      <span class="filter-dd-label">{{ label }}</span>
      <span class="filter-dd-value">{{ currentLabel }}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div
      class="pop pop-menu filter-dd-pop"
      :id="popId"
      ref="popEl"
      :hidden="!open"
      role="listbox"
      :aria-label="label + '筛选'"
      @click.stop
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="pop-item"
        role="option"
        :data-value="opt.value"
        :class="{ active: opt.value === value }"
        :aria-selected="opt.value === value ? 'true' : undefined"
        @click="pick(opt.value)"
      >{{ opt.label }}<span
          v-if="counts && counts[opt.value] !== undefined"
          class="chip-count"
          :data-count="opt.value"
        >{{ counts[opt.value] }}</span></button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { clampWithinContainer } from '../composables/usePopupPlacement.js';

const props = defineProps({
  label: { type: String, required: true },
  triggerId: { type: String, required: true },
  popId: { type: String, required: true },
  value: { type: String, default: 'all' },
  options: { type: Array, required: true }, // [{value, label}]
  counts: { type: Object, default: null },  // optional {value: n} shown as badges
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['change', 'update:open']);

const popEl = ref(null);

const filtered = computed(() => props.value !== 'all');
const currentLabel = computed(() => {
  const opt = props.options.find((o) => o.value === props.value);
  return opt ? opt.label : '全部';
});

watch(
  () => props.open,
  (v) => {
    if (v) nextTick(() => clampWithinContainer(popEl.value, null));
  }
);

function pick(v) {
  emit('update:open', false);
  emit('change', v);
}
</script>
