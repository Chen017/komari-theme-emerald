<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { RouterLink } from 'vue-router'
import { useNodesStore } from '@/stores/nodes'
import Availability30dCard from '../availability/Availability30dCard.vue'
import CostSummaryCard from '../components/CostSummaryCard.vue'
import IpqaOverviewSection from '../components/IpqaOverviewSection.vue'
import TrafficTrendCard from '../traffic/TrafficTrendCard.vue'

defineOptions({ name: 'ResourceInsightsPage' })

const nodesStore = useNodesStore()
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-4 py-6 overflow-x-hidden space-y-6">
    <!-- Hero Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2">
          <RouterLink
            :to="{ name: 'home' }"
            class="inline-flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            <Icon icon="lucide:arrow-left" class="size-3.5" />
            返回首页
          </RouterLink>
        </div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Resource Insights
        </p>
        <h1 class="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100 sm:text-3xl">
          资源概览
        </h1>
        <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-500 sm:text-sm">
          每日流量趋势、30 天 VPS 在线率、IP 质量检测与轻量成本摘要。
        </p>
      </div>
    </div>

    <!-- Top Grid: Traffic Trends (left) + 30-day Uptime (right) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-7">
        <TrafficTrendCard :nodes="nodesStore.nodes" />
      </div>
      <div class="lg:col-span-5">
        <Availability30dCard :nodes="nodesStore.nodes" />
      </div>
    </div>

    <!-- IP Quality Section -->
    <IpqaOverviewSection :nodes="nodesStore.nodes" />

    <!-- Cost Summary Section -->
    <CostSummaryCard :nodes="nodesStore.nodes" />
  </div>
</template>
