<template>
  <!-- 搁置视图：filters.shelved='only' 由 applyView('shelved') 设置，TaskList 只列搁置任务 -->
  <TaskList />
</template>

<script setup>
import TaskList from '../components/TaskList.vue';
</script>
