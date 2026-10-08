/* WorkTodo — app logic (no dependencies) */

(function () {
  'use strict';

  const STORAGE_KEY = 'worktodo.tasks.v1';

  const STATUS_LABELS = {
    todo: '待办',
    'in-progress': '进行中',
    done: '已完成',
  };

  const PRIORITY_LABELS = {
    high: '高',
    medium: '中',
    low: '低',
  };

  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const STATUS_CYCLE = ['todo', 'in-progress', 'done'];

  /** @type {Task[]} */
  let tasks = [];
  let filters = { status: 'all', priority: 'all', search: '' };
  let editingId = null;
  let pendingDeleteId = null;
  let storageError = false;

  // ——— Storage layer ———

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        storageError = true;
        return [];
      }
      return parsed.filter(isValidTask);
    } catch (err) {
      console.error('loadTasks failed', err);
      storageError = true;
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      storageError = false;
      hideError();
      return true;
    } catch (err) {
      console.error('saveTasks failed', err);
      storageError = true;
      showError('无法写入本地存储，数据可能不会被保存。');
      return false;
    }
  }

  function isValidTask(t) {
    return (
      t &&
      typeof t === 'object' &&
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      Object.hasOwn(STATUS_LABELS, t.status) &&
      Object.hasOwn(PRIORITY_LABELS, t.priority)
    );
  }

  function createTask({ title, status, priority, dueDate }) {
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      status: status || 'todo',
      priority: priority || 'medium',
      dueDate: dueDate || null,
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    saveTasks();
    return task;
  }

  function updateTask(id, patch) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const next = {
      ...tasks[idx],
      ...patch,
      title: typeof patch.title === 'string' ? patch.title.trim() : tasks[idx].title,
      updatedAt: new Date().toISOString(),
    };
    tasks[idx] = next;
    saveTasks();
    return next;
  }

  function removeTask(id) {
    const before = tasks.length;
    tasks = tasks.filter((t) => t.id !== id);
    if (tasks.length !== before) saveTasks();
  }

  function getTask(id) {
    return tasks.find((t) => t.id === id) || null;
  }

  // ——— Derived data ———

  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isOverdue(task) {
    return !!task.dueDate && task.status !== 'done' && task.dueDate < todayString();
  }

  function formatDue(task) {
    if (!task.dueDate) return null;
    return task.dueDate;
  }

  function sortTasks(list) {
    return [...list].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aDue = a.dueDate || '9999-12-31';
      const bDue = b.dueDate || '9999-12-31';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;

      const ap = PRIORITY_RANK[a.priority] ?? 1;
      const bp = PRIORITY_RANK[b.priority] ?? 1;
      if (ap !== bp) return ap - bp;

      const aCreated = a.createdAt || '';
      const bCreated = b.createdAt || '';
      if (aCreated === bCreated) return 0;
      return aCreated < bCreated ? 1 : -1;
    });
  }

  function visibleTasks() {
    const q = filters.search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortTasks(list);
  }

  // ——— DOM helpers ———

  const $ = (sel) => document.querySelector(sel);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function showError(msg) {
    const banner = $('#error-banner');
    banner.textContent = msg;
    banner.hidden = false;
  }

  function hideError() {
    const banner = $('#error-banner');
    banner.hidden = true;
    banner.textContent = '';
  }

  // ——— Render ———

  function render() {
    renderList();
    renderStats();
  }

  function renderStats() {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const active = total - done;
    const overdue = tasks.filter(isOverdue).length;

    let text = `共 ${total} 项 · 进行中/待办 ${active} · 已完成 ${done}`;
    if (overdue > 0) text += ` · 过期 ${overdue}`;
    $('#task-stats').textContent = text;
  }

  function renderList() {
    const container = $('#task-list');
    container.innerHTML = '';

    const list = visibleTasks();

    if (list.length === 0) {
      const empty = el('div', 'empty-state');
      const h = el('h2', null, tasks.length === 0 ? '还没有任务' : '没有匹配的任务');
      const p = el(
        'p',
        null,
        tasks.length === 0
          ? '点击右上角「新建任务」，记下第一件要做的事。'
          : '试试调整筛选条件或清空搜索关键词。'
      );
      empty.appendChild(h);
      empty.appendChild(p);
      container.appendChild(empty);
      return;
    }

    for (const task of list) {
      container.appendChild(renderTaskCard(task));
    }
  }

  function renderTaskCard(task) {
    const card = el('article', 'task-card');
    if (task.status === 'done') card.classList.add('is-done');
    if (isOverdue(task)) card.classList.add('is-overdue');

    // Status toggle
    const toggle = el('button', `status-toggle st-${task.status}`);
    toggle.type = 'button';
    toggle.title = `状态：${STATUS_LABELS[task.status]}（点击切换）`;
    toggle.setAttribute('aria-label', `切换状态：${STATUS_LABELS[task.status]}`);
    toggle.addEventListener('click', () => {
      const i = STATUS_CYCLE.indexOf(task.status);
      const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
      updateTask(task.id, { status: next });
      render();
    });
    card.appendChild(toggle);

    // Main
    const main = el('div', 'task-main');
    const title = el('h3', 'task-title', task.title);
    main.appendChild(title);

    const meta = el('div', 'task-meta');

    const pPill = el('span', `pill pill-priority-${task.priority}`, `优先级 ${PRIORITY_LABELS[task.priority]}`);
    meta.appendChild(pPill);

    const sPill = el('span', 'pill pill-status', STATUS_LABELS[task.status]);
    meta.appendChild(sPill);

    const due = formatDue(task);
    if (due) {
      const overdue = isOverdue(task);
      const dueEl = el('span', `due-date${overdue ? ' is-overdue' : ''}`, `截止 ${due}`);
      meta.appendChild(dueEl);
      if (overdue) {
        meta.appendChild(el('span', 'pill pill-overdue', '已过期'));
      }
    }

    main.appendChild(meta);
    card.appendChild(main);

    // Actions
    const actions = el('div', 'task-actions');

    const btnEdit = el('button', 'btn-icon', '编辑');
    btnEdit.type = 'button';
    btnEdit.title = '编辑任务';
    btnEdit.addEventListener('click', () => openEditModal(task.id));
    actions.appendChild(btnEdit);

    const btnDel = el('button', 'btn-icon danger', '删除');
    btnDel.type = 'button';
    btnDel.title = '删除任务';
    btnDel.addEventListener('click', () => openConfirm(task.id));
    actions.appendChild(btnDel);

    card.appendChild(actions);
    return card;
  }

  // ——— Modal: create / edit ———

  function openCreateModal() {
    editingId = null;
    $('#modal-title').textContent = '新建任务';
    $('#field-title').value = '';
    $('#field-status').value = 'todo';
    $('#field-priority').value = 'medium';
    $('#field-due').value = '';
    $('#title-error').hidden = true;
    $('#modal-backdrop').hidden = false;
    $('#field-title').focus();
  }

  function openEditModal(id) {
    const task = getTask(id);
    if (!task) return;
    editingId = id;
    $('#modal-title').textContent = '编辑任务';
    $('#field-title').value = task.title;
    $('#field-status').value = task.status;
    $('#field-priority').value = task.priority;
    $('#field-due').value = task.dueDate || '';
    $('#title-error').hidden = true;
    $('#modal-backdrop').hidden = false;
    $('#field-title').focus();
    $('#field-title').select();
  }

  function closeModal() {
    $('#modal-backdrop').hidden = true;
    editingId = null;
    $('#title-error').hidden = true;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const title = $('#field-title').value.trim();
    if (!title) {
      $('#title-error').hidden = false;
      $('#field-title').focus();
      return;
    }
    $('#title-error').hidden = true;

    const payload = {
      title,
      status: $('#field-status').value,
      priority: $('#field-priority').value,
      dueDate: $('#field-due').value || null,
    };

    if (editingId) {
      updateTask(editingId, payload);
    } else {
      createTask(payload);
    }
    closeModal();
    render();
  }

  // ——— Confirm delete ———

  function openConfirm(id) {
    pendingDeleteId = id;
    $('#confirm-backdrop').hidden = false;
    $('#btn-confirm-ok').focus();
  }

  function closeConfirm() {
    pendingDeleteId = null;
    $('#confirm-backdrop').hidden = true;
  }

  function confirmDelete() {
    if (pendingDeleteId) {
      removeTask(pendingDeleteId);
      render();
    }
    closeConfirm();
  }

  // ——— Filters ———

  function bindSegmented(rootId, onChange) {
    const root = $(rootId);
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      root.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
      render();
    });
  }

  // ——— Init ———

  function init() {
    tasks = loadTasks();
    if (storageError) {
      showError('本地存储读取失败，请检查浏览器设置。');
    }
    render();

    $('#btn-new').addEventListener('click', openCreateModal);
    $('#btn-cancel').addEventListener('click', closeModal);
    $('#task-form').addEventListener('submit', handleSubmit);
    $('#btn-clear-date').addEventListener('click', () => {
      $('#field-due').value = '';
    });

    $('#btn-confirm-cancel').addEventListener('click', closeConfirm);
    $('#btn-confirm-ok').addEventListener('click', confirmDelete);

    // Close modals on backdrop click
    $('#modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    $('#confirm-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'confirm-backdrop') closeConfirm();
    });

    // Escape closes topmost modal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#confirm-backdrop').hidden) closeConfirm();
      else if (!$('#modal-backdrop').hidden) closeModal();
    });

    $('#search-input').addEventListener('input', (e) => {
      filters.search = e.target.value;
      render();
    });

    bindSegmented('#status-filter', (v) => {
      filters.status = v;
    });
    bindSegmented('#priority-filter', (v) => {
      filters.priority = v;
    });
  }

  // Public surface for console / future tests
  window.WorkTodo = {
    loadTasks,
    saveTasks,
    createTask,
    updateTask,
    removeTask,
    getTask,
    sortTasks,
    visibleTasks,
    STORAGE_KEY,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
