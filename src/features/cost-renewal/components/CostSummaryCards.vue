<script setup lang="ts">
import type { CostRenewalSummary } from '../types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { formatCny } from '../services/fx'

const props = defineProps<{
  summary: CostRenewalSummary
  loading?: boolean
}>()

const cards = computed(() => [
  {
    label: '月均成本（CNY）',
    value: formatCny(props.summary.monthlyCny),
    detail: props.summary.pricedNodeCount === props.summary.totalNodeCount
      ? `覆盖全部 ${props.summary.totalNodeCount} 台节点`
      : `基于 ${props.summary.pricedNodeCount}/${props.summary.totalNodeCount} 台有效计价节点`,
    icon: 'lucide:coins',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    label: '年度预算（CNY）',
    value: formatCny(props.summary.annualBudgetCny),
    detail: '按 12 个月折算估算',
    icon: 'lucide:calendar-range',
    accent: 'text-sky-600 dark:text-sky-400',
  },
  {
    label: '近期续费金额',
    value: formatCny(props.summary.upcomingRenewalCny),
    detail: `未来 30 天内应续 ${props.summary.upcomingRenewalCount} 台节点`,
    icon: 'lucide:credit-card',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  {
    label: '即将续费节点数',
    value: String(props.summary.upcomingRenewalCount),
    detail: props.summary.upcomingRenewalCount > 0 ? '建议关注续费节点余额' : '暂无临近到期节点',
    icon: 'lucide:clock-alert',
    accent: props.summary.upcomingRenewalCount > 0
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-muted-foreground',
  },
])
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div
      v-for="card in cards"
      :key="card.label"
      class="flex flex-col justify-between rounded-lg border border-border/70 bg-card/60 p-4 shadow-xs transition-colors hover:border-emerald-500/40"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-muted-foreground">{{ card.label }}</span>
        <Icon :icon="card.icon" class="size-4" :class="card.accent" aria-hidden="true" />
      </div>

      <div class="my-3">
        <div v-if="loading" class="h-8 w-24 animate-pulse rounded bg-muted" />
        <div v-else class="text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {{ card.value }}
        </div>
      </div>

      <div class="truncate text-[11px] text-muted-foreground" :title="card.detail">
        {{ card.detail }}
      </div>
    </div>
  </div>
</template>
