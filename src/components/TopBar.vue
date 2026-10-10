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

    <div class="pop-anchor">
      <button type="button" id="btn-filter" class="btn" aria-haspopup="true" @click.stop="toggleFilterPop">筛选</button>
      <div class="pop" id="filter-pop" :hidden="!ui.state.filterPopOpen" @click.stop>
        <h4>状态</h4>
        <div class="chipbar" id="pop-status">
          <button
            v-for="opt in statusOptions"
            :key="opt.value"
            type="button"
            class="chip"
            :class="{ active: ui.state.filters.status === opt.value }"
            :data-value="opt.value"
            @click="onStatus(opt.value)"
          >{{ opt.label }}</button>
        </div>
        <h4>优先级</h4>
        <div class="chipbar" id="pop-priority">
          <button
            type="button"
            class="chip"
            :class="{ active: ui.state.filters.priority === 'all' }"
            data-value="all"
            @click="onPriority('all')"
          >全部</button>
          <button
            v-for="opt in priorityOptions"
            :key="opt.value"
            type="button"
            class="chip prio"
            :class="[opt.cls, { active: ui.state.filters.priority === opt.value }]"
            :data-value="opt.value"
            @click="onPriority(opt.value)"
          ><i></i>{{ opt.label }}</button>
        </div>
      </div>
    </div>

    <button type="button" id="btn-new" class="btn btn-primary" @click="createNew">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <span>新建任务</span>
    </button>

    <TitleBarControls />
  </div>
</template>

<script setup>
import SearchBar from './SearchBar.vue';
import BrandMark from './BrandMark.vue';
import TitleBarControls from './TitleBarControls.vue';
import { useUiStore } from '../store/ui.js';
import { useFilterChips } from '../composables/useFilterChips.js';

const ui = useUiStore();
const { onStatus, onPriority } = useFilterChips();

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'in-progress', label: '进行中' },
  { value: 'done', label: '已完成' },
];
const priorityOptions = [
  { value: 'high', label: '高', cls: 'high' },
  { value: 'medium', label: '中', cls: 'medium' },
  { value: 'low', label: '低', cls: 'low' },
];

function toggleFilterPop() {
  ui.state.filterPopOpen = !ui.state.filterPopOpen;
  ui.state.sortPopOpen = false;
}

function createNew() {
  ui.openTaskModal(null, document.getElementById('btn-new'));
}
</script>
