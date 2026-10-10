<template>
  <Teleport to="body">
    <div
      v-if="ui.state.projectMenu.open"
      class="ctx-menu"
      role="menu"
      :style="{ position: 'absolute', top: ui.state.projectMenu.top + 'px', left: ui.state.projectMenu.left + 'px' }"
    >
      <button type="button" class="ctx-menu-item" @click.stop="rename">重命名项目</button>
      <button type="button" class="ctx-menu-item" @click.stop="remove">删除项目</button>
    </div>
  </Teleport>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();

function rename() {
  const id = ui.state.projectMenu.projectId;
  ui.closeProjectMenu();
  ui.openProjectModal(id);
}

function remove() {
  const id = ui.state.projectMenu.projectId;
  ui.closeProjectMenu();
  const p = tasks.getProject(id);
  if (!p) return;
  ui.openConfirmCustom(`将删除项目「${p.name}」，项目下的任务会归入无项目。删除后 15 秒内可撤销。`, () => {
    const snap = tasks.snapshotAll();
    const wasViewing = ui.state.filters.projectId === id;
    tasks.removeProject(id);
    if (wasViewing) router.push('/all');
    ui.showToast('项目已删除', '撤销', () => {
      tasks.restoreAll(snap.tasks, snap.projects);
    });
  });
}
</script>
