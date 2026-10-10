<template>
  <div id="error-banner" class="error-banner" :hidden="!message" role="alert">{{ message }}</div>
</template>

<script setup>
import { computed } from 'vue';
import { useTaskStore } from '../store/tasks.js';

const tasks = useTaskStore();
const message = computed(() => tasks.state.errorMessage || '');
</script>
