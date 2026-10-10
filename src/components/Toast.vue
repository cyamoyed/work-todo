<template>
  <div id="toast" class="toast" :hidden="!ui.state.toast.open" role="status" aria-live="polite">
    <span>{{ ui.state.toast.message }}</span>
    <button v-if="ui.state.toast.actionLabel" type="button" @click="ui.toastAction()">
      {{ ui.state.toast.actionLabel }}
    </button>
  </div>
</template>

<script setup>
import { useUiStore } from '../store/ui.js';

const ui = useUiStore();
</script>
