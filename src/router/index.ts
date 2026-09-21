import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/instance/:id',
      name: 'instance-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
    {
      path: '/resource-insights',
      name: 'resource-insights',
      component: () => import('@/features/resource-insights/pages/ResourceInsightsPage.vue'),
    },
    {
      path: '/cost-renewal',
      name: 'cost-renewal',
      component: () => import('@/features/cost-renewal/pages/CostRenewalPage.vue'),
    },
    {
      path: '/ip-quality/:uuid',
      name: 'ipqa-node-detail',
      component: () => import('@/features/ipqa/pages/IpqaNodeDetailPage.vue'),
    },
  ],
})

export default router
