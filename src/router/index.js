/* WorkTodo — hash router. Router owns viewMode/projectId; store syncs one-way via afterEach. */

import { createRouter, createWebHashHistory } from 'vue-router';
import TodayView from '../views/TodayView.vue';
import WeekView from '../views/WeekView.vue';
import DaylinePage from '../views/DaylinePage.vue';
import AllView from '../views/AllView.vue';
import DoneView from '../views/DoneView.vue';
import ReviewPage from '../views/ReviewPage.vue';
import ProjectView from '../views/ProjectView.vue';

const routes = [
  { path: '/', redirect: '/today' },
  { path: '/today', name: 'today', component: TodayView },
  { path: '/week', name: 'week', component: WeekView },
  { path: '/dayline', name: 'dayline', component: DaylinePage },
  { path: '/all', name: 'all', component: AllView },
  { path: '/done', name: 'done', component: DoneView },
  { path: '/review', name: 'review', component: ReviewPage },
  {
    path: '/project/:id',
    name: 'project',
    component: ProjectView,
    props: (route) => ({ projectId: String(route.params.id) }),
  },
  { path: '/:pathMatch(.*)*', redirect: '/today' },
];

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes,
  });
}
