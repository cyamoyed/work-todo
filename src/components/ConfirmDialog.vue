<template>
  <div id="confirm-backdrop" class="modal-backdrop" :hidden="!ui.state.confirm.open" @click.self="ui.closeConfirm()">
    <div class="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="modal-header">
        <h2 id="confirm-title">确认操作</h2>
      </div>
      <p id="confirm-message">{{ ui.state.confirm.message }}</p>
      <div class="modal-actions">
        <button type="button" id="btn-confirm-cancel" class="btn btn-ghost" @click="ui.closeConfirm()" ref="cancelBtn">取消</button>
        <button type="button" id="btn-confirm-ok" class="btn btn-danger" @click="ui.confirmOk()">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { useUiStore } from '../store/ui.js';

const ui = useUiStore();
const cancelBtn = ref(null);

watch(
  () => ui.state.confirm.open,
  (open) => {
    if (open) {
      nextTick(() => {
        const btn = document.getElementById('btn-confirm-cancel');
        if (btn && btn.focus) btn.focus();
      });
    }
  }
);
</script>
