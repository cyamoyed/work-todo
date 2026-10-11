<template>
  <div class="top" data-tauri-drag-region>
    <button
      type="button"
      id="btn-mobile-menu"
      class="btn-icon mobile-menu-btn"
      aria-label="打开菜单"
      :aria-expanded="ui.state.drawerOpen ? 'true' : 'false'"
      aria-controls="mobile-drawer"
      @click="ui.openDrawer()"
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
    <div class="brand-mobile" aria-hidden="true"><BrandMark :size="16" /> work-todo</div>
    <SearchBar />

    <TitleBarControls />
  </div>
</template>

<script setup>
import SearchBar from './SearchBar.vue';
import BrandMark from './BrandMark.vue';
import TitleBarControls from './TitleBarControls.vue';
import { useUiStore } from '../store/ui.js';

const ui = useUiStore();
</script>
