/**
 * Test harness for WorkTodo — loads app.js in Node with injectable mocks
 * and exposes pure internals for unit testing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP_PATH = path.join(ROOT, 'app.js');

function createLocalStorage() {
  const store = new Map();
  let failGet = false;
  let failSet = false;
  const api = {
    getItem(k) {
      if (failGet) throw new Error('storage get failure');
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      if (failSet) throw new Error('storage set failure');
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
    key(i) {
      return Array.from(store.keys())[i] ?? null;
    },
    get length() {
      return store.size;
    },
    // test helpers
    _store: store,
    _failGet(on) {
      failGet = !!on;
    },
    _failSet(on) {
      failSet = !!on;
    },
    _dump() {
      return Object.fromEntries(store);
    },
  };
  return api;
}

function createCrypto() {
  let n = 0;
  return {
    randomUUID() {
      n += 1;
      // deterministic, unique, valid UUID shape
      return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    },
  };
}

/** Minimal but interactive DOM mock sufficient for app.js init + render paths. */
function createDom() {
  const listeners = new Map(); // element -> {event -> [fns]}

  function makeClassList(node) {
    const set = new Set();
    return {
      add(...cls) {
        cls.forEach((c) => set.add(c));
        node._classes = set;
      },
      remove(...cls) {
        cls.forEach((c) => set.delete(c));
        node._classes = set;
      },
      toggle(c, force) {
        const on = force != null ? force : !set.has(c);
        if (on) set.add(c);
        else set.delete(c);
        node._classes = set;
        return on;
      },
      contains(c) {
        return set.has(c);
      },
      get value() {
        return Array.from(set).join(' ');
      },
    };
  }

  function makeEl(tag = 'div', ns = null) {
    const node = {
      tagName: String(tag).toUpperCase(),
      namespaceURI: ns,
      hidden: false,
      disabled: false,
      value: '',
      _textContent: '',
      _innerHTML: '',
      _className: '',
      id: '',
      type: '',
      title: '',
      href: '',
      dataset: {},
      style: {},
      children: [],
      parentNode: null,
      offsetParent: {},
      isContentEditable: false,
      attributes: {},
      classList: null,
      setAttribute(k, v) {
        this.attributes[k] = String(v);
        if (k === 'class') this.className = String(v);
        if (k === 'id') this.id = String(v);
      },
      getAttribute(k) {
        return this.attributes[k] ?? null;
      },
      removeAttribute(k) {
        delete this.attributes[k];
      },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        child.parentNode = null;
        return child;
      },
      querySelector(sel) {
        return queryIn(this, sel, true);
      },
      querySelectorAll(sel) {
        return queryIn(this, sel, false);
      },
      closest(sel) {
        let n = this;
        while (n) {
          if (matches(n, sel)) return n;
          n = n.parentNode;
        }
        return null;
      },
      addEventListener(type, fn) {
        if (!listeners.has(this)) listeners.set(this, {});
        const bag = listeners.get(this);
        (bag[type] = bag[type] || []).push(fn);
      },
      removeEventListener(type, fn) {
        const bag = listeners.get(this);
        if (!bag || !bag[type]) return;
        bag[type] = bag[type].filter((f) => f !== fn);
      },
      dispatchEvent(evt) {
        const bag = listeners.get(this);
        if (!bag) return true;
        const fns = bag[evt.type] || [];
        for (const fn of fns) fn.call(this, evt);
        return true;
      },
      focus() {
        document.activeElement = this;
      },
      blur() {},
      select() {},
      click() {
        this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} });
      },
    };
    node.classList = makeClassList(node);

    Object.defineProperty(node, 'className', {
      get() { return node._className; },
      set(v) {
        node._className = String(v);
        const set = new Set(String(v).split(/\s+/).filter(Boolean));
        node.classList = makeClassList(node);
        // re-seed classList set
        for (const c of set) node.classList.add(c);
      },
    });

    Object.defineProperty(node, 'textContent', {
      get() {
        if (node.children && node.children.length) {
          return node.children.map((c) => (c.textContent != null ? c.textContent : '')).join('');
        }
        return node._textContent || '';
      },
      set(v) {
        node._textContent = String(v);
        // assigning textContent clears children in real DOM
        if (node.children) node.children.length = 0;
      },
    });

    Object.defineProperty(node, 'innerHTML', {
      get() { return node._innerHTML; },
      set(v) {
        node._innerHTML = String(v);
        if (v === '' || v == null) {
          node.children.length = 0;
        }
      },
    });

    return node;
  }

  function matches(node, sel) {
    if (!node || !sel) return false;
    if (!node.tagName && !node.classList) return false;
    const s = String(sel).trim();
    // support: #id, .class, tag, [attr], [attr="v"], compound like button[data-value]
    // and descendant is NOT handled here (querySelector does that).
    if (s.startsWith('#')) return node.id === s.slice(1);
    if (s.startsWith('.')) {
      const cls = s.slice(1).split('.').filter(Boolean);
      return cls.every((c) => node.classList.contains(c));
    }
    // attribute-only or compound
    const attrRe = /\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/g;
    const attrs = [];
    let m;
    let rest = s;
    while ((m = attrRe.exec(s))) {
      attrs.push([m[1], m[2]]);
    }
    rest = s.replace(attrRe, '').trim();
    if (rest && rest !== '*' && !node.tagName.toLowerCase().startsWith(rest.toLowerCase())) {
      // could be tag + attrs already stripped
      if (!node.tagName.toLowerCase().includes(rest.toLowerCase())) return false;
    }
    for (const [k, v] of attrs) {
      const actual = node.dataset ? node.dataset[camel(k)] : undefined;
      const attrVal = node.getAttribute(k);
      const val = actual != null ? actual : attrVal;
      if (v == null) {
        if (val == null && actual == null) return false;
      } else if (String(val) !== v) {
        return false;
      }
    }
    return true;
  }

  function camel(k) {
    return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  function queryIn(root, sel, firstOnly) {
    const out = [];
    const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
    const walk = (node) => {
      for (const p of parts) {
        // descendant selector "a b"
        const segs = p.split(/\s+/).filter(Boolean);
        if (matchPath(node, segs)) {
          if (!out.includes(node)) out.push(node);
        }
      }
      const kids = node.children || [];
      for (const c of kids) walk(c);
    };
    for (const c of root.children) walk(c);
    // also match root itself for simple selectors
    for (const p of parts) {
      const segs = p.split(/\s+/).filter(Boolean);
      if (segs.length === 1 && matches(root, segs[0]) && !out.includes(root)) {
        out.push(root);
      }
    }
    return firstOnly ? out[0] || null : out;
  }

  function matchPath(node, segs) {
    if (segs.length === 0) return false;
    if (!matches(node, segs[segs.length - 1])) return false;
    let i = segs.length - 2;
    let n = node.parentNode;
    while (i >= 0 && n) {
      if (matches(n, segs[i])) i -= 1;
      n = n.parentNode;
    }
    return i < 0;
  }

  // Registry of known IDs from index.html so $('#id') works
  const ids = {};
  const register = (id, tag = 'div') => {
    const n = makeEl(tag);
    n.id = id;
    n.setAttribute('id', id);
    ids[id] = n;
    return n;
  };

  const document = {
    readyState: 'complete',
    activeElement: null,
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    createElementNS: (ns, tag) => makeEl(tag, ns),
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text), parentNode: null, children: [], classList: null, tagName: null };
    },
    getElementById: (id) => ids[id] || null,
    querySelector(sel) {
      if (sel.startsWith('#')) return ids[sel.slice(1)] || null;
      return queryIn(document.body, sel, true);
    },
    querySelectorAll(sel) {
      return queryIn(document.body, sel, false);
    },
    addEventListener(type, fn) {
      if (!listeners.has(document)) listeners.set(document, {});
      const bag = listeners.get(document);
      (bag[type] = bag[type] || []).push(fn);
    },
    removeEventListener() {},
    dispatchEvent(evt) {
      const bag = listeners.get(document) || {};
      for (const fn of bag[evt.type] || []) fn.call(document, evt);
      return true;
    },
  };

  // Pre-register every id used by app.js
  const HTML_IDS = [
    'today-label', 'stat-done', 'stat-total', 'stat-active', 'stat-todo', 'stat-overdue',
    'progress-fill', 'overview-sub', 'list-meta', 'task-stats', 'task-list',
    'status-filter', 'priority-filter', 'range-filter', 'error-banner',
    'modal-backdrop', 'modal-title', 'btn-new', 'btn-cancel', 'btn-close-modal',
    'task-form', 'field-title', 'field-notes', 'field-status', 'field-priority', 'field-due',
    'field-due-time', 'field-due-label', 'field-status-wrap', 'field-priority-wrap', 'title-error',
    'btn-clear-date', 'btn-due', 'date-picker', 'calendar', 'cal-prev', 'cal-next',
    'cal-title', 'cal-grid', 'cal-today', 'cal-clear',
    'confirm-backdrop', 'confirm-message', 'btn-confirm-cancel', 'btn-confirm-ok',
    'toast', 'search-input', 'btn-clear-search',
    'quick-add-form', 'quick-title', 'sort-select', 'btn-clear-done',
    'btn-export', 'btn-import', 'import-file', 'fab-new', 'done-toggle',
    'strip', 'list-title', 'done-list', 'done-toggle-wrap', 'done-toggle-bar',
    'project-list', 'btn-new-project', 'project-progress', 'field-project',
    'field-project-wrap', 'btn-project', 'project-pop', 'field-project-label',
    'project-backdrop', 'project-form', 'project-modal-title', 'field-project-name',
    'project-title-error', 'field-project-color', 'field-project-color-wrap',
    'btn-close-project', 'btn-cancel-project',
    'btn-filter', 'filter-pop', 'pop-status', 'pop-priority',
    'btn-sort', 'sort-pop', 'sort-label-text', 'btn-due-time', 'time-pop', 'field-due-time-label',
    'nav', 'nav-count-today', 'nav-count-week', 'nav-count-dayline', 'nav-count-all', 'nav-count-done',
    'field-due-time-wrap',
  ];
  const HIDDEN_BY_DEFAULT = new Set([
    'error-banner', 'title-error', 'modal-backdrop', 'confirm-backdrop',
    'toast', 'btn-clear-search', 'calendar', 'import-file', 'btn-clear-done',
  ]);
  for (const id of HTML_IDS) {
    const node = register(id, id.includes('btn') || id.includes('cal-') || id.includes('fab') ? 'button' : 'div');
    if (HIDDEN_BY_DEFAULT.has(id)) node.hidden = true;
  }

  // wire search input
  ids['search-input'].value = '';
  ids['field-title'].value = '';
  ids['field-notes'].value = '';
  ids['field-status'].value = 'todo';
  ids['field-priority'].value = 'medium';
  ids['field-due'].value = '';
  ids['field-due-time'].value = '';
  ids['quick-title'].value = '';
  ids['sort-select'].value = 'due';

  // attach body children so descendant queries work
  for (const id of HTML_IDS) document.body.appendChild(ids[id]);

  return {
    document,
    ids,
    makeEl,
    trigger(elOrId, type, event = {}) {
      const node = typeof elOrId === 'string' ? ids[elOrId] : elOrId;
      const evt = { type, target: node, preventDefault() {}, stopPropagation() {}, ...event };
      node.dispatchEvent(evt);
    },
    triggerKey(key, target = document.body) {
      const evt = {
        type: 'keydown',
        key,
        target,
        preventDefault() {},
        stopPropagation() {},
      };
      document.dispatchEvent(evt);
      return evt;
    },
  };
}

/**
 * Load app.js. If exposeInternals, also export pure helpers via source patch.
 */
function loadApp({ exposeInternals = true, autoInit = true } = {}) {
  const localStorage = createLocalStorage();
  const cryptoObj = createCrypto();
  const dom = createDom();

  global.localStorage = localStorage;
  global.crypto = cryptoObj;
  global.document = dom.document;
  global.window = global;
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);

  // document fragment shim used by list render
  if (!dom.document.createDocumentFragment) {
    dom.document.createDocumentFragment = function () {
      const kids = [];
      return {
        appendChild(node) { kids.push(node); return node; },
        get childNodes() { return kids; },
        get children() { return kids; },
      };
    };
  }

  let src = fs.readFileSync(APP_PATH, 'utf8');
  if (exposeInternals) {
    // Expand public surface so pure helpers are unit-testable without changing prod code.
    src = src.replace(
      'window.WorkTodo = {',
      `window.WorkTodo = {
    // internals re-exported for tests
    isValidTask,
    isOverdue,
    dayDiff,
    formatDue,
    formatTodayLabel,
    todayString,
    parseDateStr,
    formatDueLabel,
    pad2,
    toDateStr,
    STATUS_LABELS,
    PRIORITY_LABELS,
    PRIORITY_RANK,
    STATUS_CYCLE,
    NOTES_MAX,
    TITLE_MAX,
    normalizeDueDate,
    normalizeDueTime,
    normalizeNotes,
    matchSearch,
    matchRange,
    isDueTodayOpen,
    nowTimeHM,
    dateStr,
    getFilters: () => ({ ...filters }),
    setFilters(f) { filters = { ...filters, ...f }; },
    getStorageError: () => storageError,
    getTasksRef: () => tasks,
    setTasksRef(list) { tasks = list; },
    render,
    setView,
    cloneNextOccurrence,
    nextDueDate,
    isCompletedThisWeek,
    normalizeTags,
    normalizeRepeat,
    getViewMode: () => viewMode,
    visibleTasks,
    sortTasks,
    `
    );
  }

  // eslint-disable-next-line no-eval
  (0, eval)(src);

  // Reset filters so unit tests start from a clean "all" filter set
  if (global.WorkTodo && typeof global.WorkTodo.setFilters === 'function') {
    global.WorkTodo.setFilters({
      range: 'all',
      status: 'all',
      priority: 'all',
      search: '',
      projectId: null,
    });
  }

  return {
    API: global.WorkTodo,
    localStorage,
    dom,
    document: dom.document,
    ids: dom.ids,
    resetStorage() {
      localStorage.clear();
      localStorage._failGet(false);
      localStorage._failSet(false);
    },
    seedRaw(str) {
      localStorage.setItem(global.WorkTodo.STORAGE_KEY, str);
    },
  };
}

function assert(cond, name, detail) {
  return { ok: !!cond, name, detail: detail || '' };
}

module.exports = {
  loadApp,
  createLocalStorage,
  createDom,
  createCrypto,
  assert,
  ROOT,
  APP_PATH,
};
