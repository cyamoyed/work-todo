<template>
  <TaskList />
</template>

<script setup>
import TaskList from '../components/TaskList.vue';

defineProps({
  projectId: { type: String, default: '' },
});
</script>
