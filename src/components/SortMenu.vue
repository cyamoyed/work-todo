<template>
  <div class="pop-anchor">
    <input type="hidden" id="sort-select" :value="ui.state.sortMode" />
    <button
      type="button"
      id="btn-sort"
      class="btn sm"
      aria-haspopup="listbox"
      aria-label="排序方式"
      @click.stop="toggle"
    >
      <span id="sort-label-text">{{ sortLabel }}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div class="pop pop-menu" id="sort-pop" :hidden="!ui.state.sortPopOpen" @click.stop>
      <button
        type="button"
        data-value="due"
        class="pop-item"
        :class="{ active: ui.state.sortMode === 'due' }"
        @click="pick('due')"
      >按截止日</button>
      <button
        type="button"
        data-value="priority"
        class="pop-item"
        :class="{ active: ui.state.sortMode === 'priority' }"
        @click="pick('priority')"
      >按优先级</button>
      <button
        type="button"
        data-value="created"
        class="pop-item"
        :class="{ active: ui.state.sortMode === 'created' }"
        @click="pick('created')"
      >按创建时间</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUiStore } from '../store/ui.js';

const ui = useUiStore();

const sortLabel = computed(() =>
  ui.state.sortMode === 'priority' ? '按优先级' : ui.state.sortMode === 'created' ? '按创建时间' : '按截止日'
);

function toggle() {
  ui.state.sortPopOpen = !ui.state.sortPopOpen;
  ui.state.filterPopOpen = false;
}

function pick(value) {
  ui.setSortMode(value);
  ui.state.sortPopOpen = false;
}
</script>
