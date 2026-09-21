<script setup lang="ts">
import type { IpqaFleetOverview } from '../types'
import { Icon } from '@iconify/vue'

defineProps<{
  overview: IpqaFleetOverview
}>()
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <!-- Total IPQA Nodes -->
    <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] text-neutral-400 dark:text-neutral-500">IPQA 节点</span>
        <Icon icon="lucide:server" class="w-3.5 h-3.5 text-indigo-500/70" />
      </div>
      <div class="text-xl font-bold text-neutral-800 dark:text-neutral-100">
        {{ overview.ipqa_nodes }} <span class="text-xs font-normal text-neutral-400">/ {{ overview.total_nodes }} 台</span>
      </div>
      <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
        已纳入质量监测
      </div>
    </div>

    <!-- Risk Attention -->
    <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] text-neutral-400 dark:text-neutral-500">风险关注</span>
        <Icon icon="lucide:shield-alert" class="w-3.5 h-3.5 text-orange-500/70" />
      </div>
      <div class="text-xl font-bold" :class="overview.nodes_with_risk > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-neutral-800 dark:text-neutral-100'">
        {{ overview.nodes_with_risk }} <span class="text-xs font-normal text-neutral-400">台</span>
      </div>
      <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
        评级达到中高风险
      </div>
    </div>

    <!-- Today's Changes -->
    <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] text-neutral-400 dark:text-neutral-500">今日变化</span>
        <Icon icon="lucide:git-commit-horizontal" class="w-3.5 h-3.5 text-emerald-500/70" />
      </div>
      <div class="text-xl font-bold" :class="overview.nodes_with_changes_today > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-800 dark:text-neutral-100'">
        {{ overview.nodes_with_changes_today }} <span class="text-xs font-normal text-neutral-400">台</span>
      </div>
      <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
        检出属性或评级变更
      </div>
    </div>

    <!-- Latest Archive Date -->
    <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] text-neutral-400 dark:text-neutral-500">最新存档</span>
        <Icon icon="lucide:calendar" class="w-3.5 h-3.5 text-blue-500/70" />
      </div>
      <div class="text-sm font-bold text-neutral-800 dark:text-neutral-100 mt-1 truncate">
        {{ overview.latest_archive_date || '--' }}
      </div>
      <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">
        每日自动归档检测
      </div>
    </div>
  </div>
</template>
