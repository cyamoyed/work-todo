<template>
  <div id="project-backdrop" class="modal-backdrop" :hidden="!ui.state.projectModalOpen" @click.self="close">
    <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
      <div class="modal-header">
        <h2 id="project-modal-title">{{ ui.state.editingProjectId ? '编辑项目' : '新建项目' }}</h2>
        <button type="button" class="modal-close" id="btn-close-project" aria-label="关闭" @click="close">✕</button>
      </div>
      <form id="project-form" novalidate @submit.prevent="submit">
        <label class="field">
          <span class="field-label">项目名称</span>
          <input id="field-project-name" type="text" maxlength="40" placeholder="例如：v2.2 发布" autocomplete="off" v-model="name" />
          <span class="field-error" id="project-title-error" :hidden="!nameError">请填写项目名称</span>
        </label>
        <div class="field">
          <span class="field-label">识别色</span>
          <div class="segmented" id="field-project-color-wrap" role="group" aria-label="识别色">
            <button
              v-for="c in colors"
              :key="c.value"
              type="button"
              :data-color="c.value"
              :class="{ active: color === c.value }"
              @click="color = c.value"
            ><span class="swatch" :style="{ background: c.hex }"></span>{{ c.label }}</button>
          </div>
          <input type="hidden" id="field-project-color" :value="color" />
        </div>
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

const colors = [
  { value: 'slate', label: '灰', hex: '#a1a1aa' },
  { value: 'ink', label: '墨', hex: '#3f3f46' },
  { value: 'indigo', label: '靛', hex: '#6366f1' },
  { value: 'amber', label: '褐', hex: '#a16207' },
];

const name = ref('');
const color = ref('slate');
const nameError = ref(false);

watch(
  () => ui.state.projectModalOpen,
  (open) => {
    if (!open) return;
    nameError.value = false;
    const p = ui.state.editingProjectId ? tasks.getProject(ui.state.editingProjectId) : null;
    name.value = p ? p.name : '';
    color.value = p ? p.color : 'slate';
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
    tasks.updateProject(ui.state.editingProjectId, { name: n, color: color.value });
    ui.showToast('项目已更新');
  } else {
    const p = tasks.createProject({ name: n, color: color.value });
    router.push('/project/' + p.id);
    ui.showToast('项目已创建');
  }
  ui.closeProjectModal();
}
</script>
