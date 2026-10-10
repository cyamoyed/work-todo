/* work-todo — global keyboard shortcuts: N new · / search · Esc close · Tab focus trap */

import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../store/ui.js';

function isTypingTarget(target) {
  const tag = (target && target.tagName ? target.tagName : '').toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (target && target.isContentEditable)
  );
}

export function useKeyboardShortcuts({ onCreateNew } = {}) {
  const ui = useUiStore();

  function onKeydown(e) {
    if (e.key === 'Escape') {
      ui.closeAllPops();
      if (ui.state.confirm.open) {
        ui.closeConfirm();
        return;
      }
      if (ui.state.taskModalOpen) {
        ui.closeTaskModal();
        return;
      }
      if (ui.state.projectModalOpen) {
        ui.closeProjectModal();
        return;
      }
      return;
    }
    if (e.key === 'Tab') {
      const openBackdrop =
        (ui.state.confirm.open && document.querySelector('#confirm-backdrop')) ||
        (ui.state.taskModalOpen && document.querySelector('#modal-backdrop')) ||
        (ui.state.projectModalOpen && document.querySelector('#project-backdrop'));
      if (!openBackdrop) return;
      const focusables = openBackdrop.querySelectorAll(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      if (onCreateNew) onCreateNew();
    } else if (e.key === '/') {
      e.preventDefault();
      const input = document.querySelector('#search-input');
      if (input) input.focus();
    }
  }

  function onClick() {
    ui.closeAllPops();
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('click', onClick);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onClick);
  });
}
