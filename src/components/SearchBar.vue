<template>
  <div class="search" role="search">
    <svg class="search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" stroke-width="1.4" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
    <input
      id="search-input"
      :value="ui.state.filters.search"
      type="text"
      placeholder="搜索任务或备注…"
      autocomplete="off"
      spellcheck="false"
      aria-label="搜索任务标题与备注"
      @input="onInput"
    />
    <button
      type="button"
      id="btn-clear-search"
      class="search-clear"
      :hidden="!ui.state.filters.search"
      aria-label="清空搜索"
      @click="clear"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
    <kbd class="search-kbd" aria-hidden="true">/</kbd>
  </div>
</template>

<script setup>
import { useUiStore } from '../store/ui.js';

const ui = useUiStore();

function onInput(e) {
  ui.setFilters({ search: e.target.value });
}

function clear() {
  ui.setFilters({ search: '' });
  const input = document.querySelector('#search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}
</script>
