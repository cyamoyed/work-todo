<template>
  <div id="modal-backdrop" class="modal-backdrop" :hidden="!ui.state.taskModalOpen" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">{{ ui.state.editingId ? '编辑任务' : '新建任务' }}</h2>
        <button type="button" class="modal-close" id="btn-close-modal" aria-label="关闭" @click="close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <form id="task-form" novalidate @submit.prevent="submit">
        <label class="field">
          <span class="field-label">标题</span>
          <input id="field-title" name="title" type="text" maxlength="120" placeholder="要做什么？" autocomplete="off" v-model="form.title" />
          <span class="field-error" id="title-error" :hidden="!titleError">标题不能为空</span>
        </label>

        <div class="field">
          <span class="field-label" id="due-label">截止日期</span>
          <div class="date-row">
            <CalendarPicker v-model="form.dueDate" />
            <TimeSelect v-model="form.dueTime" />
            <button type="button" id="btn-clear-date" class="btn btn-ghost" title="清除日期" @click="clearDate">清除</button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">优先级</span>
          <div class="segmented" id="field-priority-wrap" role="group" aria-label="优先级">
            <button
              v-for="p in priorities"
              :key="p.value"
              type="button"
              :data-priority="p.value"
              :class="{ active: form.priority === p.value }"
              @click="form.priority = p.value"
            ><span class="prio-dot" :class="'prio-' + p.value"></span>{{ p.label }}</button>
          </div>
          <input type="hidden" id="field-priority" name="priority" :value="form.priority" @input="form.priority = $event.target.value" />
        </div>

        <div class="field">
          <span class="field-label" id="project-label">项目</span>
          <ProjectSelect v-model="form.projectId" />
        </div>

        <button
          type="button"
          id="btn-advanced"
          class="adv-toggle"
          :class="{ 'is-open': advancedOpen }"
          :aria-expanded="advancedOpen"
          aria-controls="advanced-fields"
          @click="advancedOpen = !advancedOpen"
        >
          <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          高级设置
          <span class="adv-hint">状态 · 备注 · 标签 · 重复</span>
        </button>

        <div id="advanced-fields" v-show="advancedOpen">
          <div class="field">
            <span class="field-label">状态</span>
            <div class="segmented" id="field-status-wrap" role="group" aria-label="状态">
              <button
                v-for="st in statusCycle"
                :key="st"
                type="button"
                :data-status="st"
                :class="{ active: form.status === st }"
                @click="form.status = st"
              >{{ STATUS_LABELS[st] }}</button>
            </div>
            <input type="hidden" id="field-status" name="status" :value="form.status" @input="form.status = $event.target.value" />
          </div>

          <label class="field">
            <span class="field-label">备注</span>
            <textarea id="field-notes" name="notes" maxlength="2000" rows="3" placeholder="补充背景、链接或验收要点（可选）" v-model="form.notes"></textarea>
          </label>

          <label class="field">
            <span class="field-label">标签</span>
            <input id="field-tags" type="text" maxlength="80" placeholder="用空格或逗号分隔，最多 5 个（可选）" autocomplete="off" v-model="form.tags" />
          </label>

          <div class="field">
            <span class="field-label" id="repeat-label">重复</span>
            <div class="segmented" id="field-repeat-wrap" role="group" aria-labelledby="repeat-label">
              <button
                v-for="r in repeats"
                :key="r.value"
                type="button"
                :data-repeat="r.value"
                :class="{ active: (form.repeat || '') === r.value }"
                @click="form.repeat = r.value"
              >{{ r.label }}</button>
            </div>
            <select id="field-repeat" aria-labelledby="repeat-label" class="sr-only" tabindex="-1" v-model="form.repeat">
              <option value="">不重复</option>
              <option value="daily">每天</option>
              <option value="weekday">工作日</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" id="btn-cancel" class="btn btn-ghost" @click="close">取消</button>
          <button type="submit" class="btn btn-primary"><span>保存</span></button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import CalendarPicker from './CalendarPicker.vue';
import TimeSelect from './TimeSelect.vue';
import ProjectSelect from './ProjectSelect.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { visibleTasks } from '../core/filters.js';
import { STATUS_CYCLE, STATUS_LABELS } from '../constants.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();

const statusCycle = STATUS_CYCLE;
const priorities = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];
const repeats = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekday', label: '工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const form = reactive({
  title: '',
  notes: '',
  status: 'todo',
  priority: 'medium',
  projectId: '',
  dueDate: '',
  dueTime: '',
  tags: '',
  repeat: '',
});
const titleError = ref(false);
const advancedOpen = ref(false);

watch(
  () => ui.state.taskModalOpen,
  (open) => {
    if (!open) return;
    titleError.value = false;
    const editing = ui.state.editingId ? tasks.getTask(ui.state.editingId) : null;
    if (editing) {
      form.title = editing.title;
      form.notes = editing.notes || '';
      form.status = editing.status;
      form.priority = editing.priority;
      form.projectId = editing.projectId || '';
      form.dueDate = editing.dueDate || '';
      form.dueTime = editing.dueTime || '';
      form.tags = (editing.tags || []).join('，');
      form.repeat = editing.repeat || '';
      // editing something that already uses advanced fields → show them
      advancedOpen.value =
        !!form.notes || !!form.tags || !!form.repeat || form.status !== 'todo';
    } else {
      form.title = '';
      form.notes = '';
      form.status = 'todo';
      form.priority = 'medium';
      form.projectId = ui.state.filters.projectId || '';
      form.dueDate = '';
      form.dueTime = '';
      form.tags = '';
      form.repeat = '';
      advancedOpen.value = false;
    }
    nextTick(() => {
      const t = document.getElementById('field-title');
      if (t) {
        t.focus();
        if (t.select && !ui.state.editingId) t.select();
      }
    });
  }
);

function close() {
  ui.closeTaskModal();
}

function clearDate() {
  form.dueDate = '';
  form.dueTime = '';
}

function submit() {
  const title = form.title.trim();
  if (!title) {
    titleError.value = true;
    const t = document.getElementById('field-title');
    if (t) t.focus();
    return;
  }
  const payload = {
    title,
    notes: form.notes,
    status: form.status || 'todo',
    priority: form.priority || 'medium',
    projectId: form.projectId || null,
    dueDate: form.dueDate || null,
    dueTime: form.dueTime || null,
    tags: form.tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
    repeat: form.repeat || null,
  };
  if (ui.state.editingId) {
    tasks.updateTask(ui.state.editingId, payload);
    ui.showToast('已保存');
  } else {
    const created = tasks.createTask(payload);
    // keep the current view honest: only expand filters if the task would be hidden
    const visible = visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode).some(
      (t) => t.id === created.id
    );
    if (!visible) {
      router.push('/all');
      ui.setFilters({ status: 'all' });
      ui.showToast('任务已创建 · 已切到「全部」以便查看');
    } else {
      ui.showToast('任务已创建');
    }
  }
  ui.closeTaskModal();
}
</script>
