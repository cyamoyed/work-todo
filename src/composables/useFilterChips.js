/* WorkTodo — shared filter-chip navigation semantics (legacy bindChips) */

import { useRouter } from 'vue-router';
import { useUiStore } from '../store/ui.js';

export function useFilterChips() {
  const ui = useUiStore();
  const router = useRouter();

  // range chips navigate (today/week/all) with status preserved; in project/dayline/review they only filter
  function onRange(value) {
    const view = ui.state.viewMode;
    if (view === 'project' || view === 'dayline' || view === 'review') {
      ui.setFilters({ range: value });
      return;
    }
    ui.state._preserveStatusOnSync = true;
    const target = value === 'today' || value === 'week' || value === 'all' ? value : 'all';
    router.push('/' + target);
  }

  // status chips: 'done' navigates to /done (except dayline/review); leaving done navigates to /all
  function onStatus(value) {
    const view = ui.state.viewMode;
    if (value === 'done' && view !== 'dayline' && view !== 'review') {
      router.push('/done');
    } else if (value !== 'done' && view === 'done') {
      ui.state._preserveStatusOnSync = true;
      ui.setFilters({ status: value });
      router.push('/all');
    } else {
      ui.setFilters({ status: value });
    }
  }

  function onPriority(value) {
    ui.setFilters({ priority: value });
  }

  return { onRange, onStatus, onPriority };
}
