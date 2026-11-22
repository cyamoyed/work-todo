<template>
  <!-- 归档视图：filters.archived='only' 由 applyView('archive') 设置，TaskList 只列归档任务 -->
  <TaskList />
</template>

<script setup>
import TaskList from '../components/TaskList.vue';
</script>
