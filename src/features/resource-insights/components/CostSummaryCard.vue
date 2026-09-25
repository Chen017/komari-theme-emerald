<script setup lang="ts">
import type { RenewalTimelineItem } from '@/features/cost-renewal'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  buildRenewalTimeline,
  calculateCostRenewalSummary,
  normalizeNodeCost,
  useFxRates,
} from '@/features/cost-renewal'

const props = defineProps<{
  nodes: readonly NodeData[]
  loading?: boolean
}>()

const { rates, source, date, fetchRates } = useFxRates()

onMounted(() => {
  void fetchRates()
})

defineExpose({
  refresh: () => fetchRates(true),
})

const summary = computed(() =>
  calculateCostRenewalSummary(
    props.nodes,
    rates.value,
    source.value,
    date.value,
    30,
  ),
)

const nextRenewal = computed(() => {
  const normalized = props.nodes.map(n => normalizeNodeCost(n, rates.value))
  const timeline = buildRenewalTimeline(normalized)
  // Find the first future renewal
  return timeline.find((item: RenewalTimelineItem) => item.daysRemaining !== null && item.daysRemaining >= 0) || null
})

function formatCny(val: number): string {
  return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
</script>

<template>
  <div class="bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl p-5 shadow-xs">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Icon icon="lucide:wallet-cards" class="w-5 h-5" />
        </div>
        <div>
          <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">
            成本与预算摘要
          </h3>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            按公开汇率及可用缓存换算为人民币（CNY）
          </p>
        </div>
      </div>

      <RouterLink
        to="/cost-renewal"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors self-start sm:self-auto"
      >
        <span>查看完整成本与续费</span>
        <Icon icon="lucide:arrow-right" class="w-3.5 h-3.5" />
      </RouterLink>
    </div>

    <!-- 4 Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <!-- Monthly Cost -->
      <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
        <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1">
          月均成本
        </div>
        <div v-if="loading" class="h-6 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 my-0.5" />
        <div v-else class="text-lg font-bold text-neutral-800 dark:text-neutral-100">
          {{ formatCny(summary.monthlyCny) }}
        </div>
        <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
          {{ summary.pricedNodeCount }} / {{ summary.totalNodeCount }} 台可折算计价
        </div>
      </div>

      <!-- Annual Budget -->
      <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
        <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1">
          年度预算
        </div>
        <div v-if="loading" class="h-6 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 my-0.5" />
        <div v-else class="text-lg font-bold text-neutral-800 dark:text-neutral-100">
          {{ formatCny(summary.annualBudgetCny) }}
        </div>
        <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
          年化预估支出
        </div>
      </div>

      <!-- Upcoming 30d Renewal -->
      <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
        <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1">
          30 天内续费
        </div>
        <div v-if="loading" class="h-6 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 my-0.5" />
        <div v-else class="text-lg font-bold text-neutral-800 dark:text-neutral-100">
          {{ formatCny(summary.upcomingRenewalCny) }}
        </div>
        <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
          {{ summary.upcomingRenewalCount }} 台待续费
        </div>
      </div>

      <!-- Next Renewal Node -->
      <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
        <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1">
          最近续费节点
        </div>
        <div v-if="loading" class="h-6 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 my-0.5" />
        <template v-else-if="nextRenewal">
          <div class="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate" :title="nextRenewal.name">
            {{ nextRenewal.name }}
          </div>
          <div class="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
            {{ nextRenewal.timingLabel }} · {{ nextRenewal.renewalLabel }}
          </div>
        </template>
        <template v-else>
          <div class="text-sm font-medium text-neutral-400 dark:text-neutral-500">
            暂无近期续费
          </div>
          <div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            未来 30 天无待续费节点
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
