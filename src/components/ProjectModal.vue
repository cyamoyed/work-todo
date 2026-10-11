<template>
  <div id="project-backdrop" class="modal-backdrop" :hidden="!ui.state.projectModalOpen" @click.self="close">
    <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
      <div class="modal-header">
        <h2 id="project-modal-title">{{ ui.state.editingProjectId ? '编辑项目' : '新建项目' }}</h2>
        <button type="button" class="modal-close" id="btn-close-project" aria-label="关闭" @click="close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <form id="project-form" novalidate @submit.prevent="submit">
        <label class="field">
          <span class="field-label">项目名称</span>
          <input id="field-project-name" type="text" maxlength="40" placeholder="例如：v2.2 发布" autocomplete="off" v-model="name" />
          <span class="field-error" id="project-title-error" :hidden="!nameError">请填写项目名称</span>
        </label>
        <div class="modal-actions">
          <button type="button" id="btn-cancel-project" class="btn btn-ghost" @click="close">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();

const name = ref('');
const nameError = ref(false);

watch(
  () => ui.state.projectModalOpen,
  (open) => {
    if (!open) return;
    nameError.value = false;
    const p = ui.state.editingProjectId ? tasks.getProject(ui.state.editingProjectId) : null;
    name.value = p ? p.name : '';
    nextTick(() => {
      const el = document.getElementById('field-project-name');
      if (el) el.focus();
    });
  }
);

function close() {
  ui.closeProjectModal();
}

function submit() {
  const n = name.value.trim();
  if (!n) {
    nameError.value = true;
    const el = document.getElementById('field-project-name');
    if (el) el.focus();
    return;
  }
  if (ui.state.editingProjectId) {
    tasks.updateProject(ui.state.editingProjectId, { name: n });
    ui.showToast('项目已更新');
  } else {
    const p = tasks.createProject({ name: n });
    router.push('/project/' + p.id);
    ui.showToast('项目已创建');
  }
  ui.closeProjectModal();
}
</script>
