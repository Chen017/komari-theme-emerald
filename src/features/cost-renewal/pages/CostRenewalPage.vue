<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useNodesStore } from '@/stores/nodes'
import { refreshAllNodes } from '@/utils/init'
import { calculateCostRenewalSummary, normalizeNodeCost } from '../calculations'
import CostSummaryCards from '../components/CostSummaryCards.vue'
import NodeCostTable from '../components/NodeCostTable.vue'
import RenewalTimeline from '../components/RenewalTimeline.vue'
import { useFxRates } from '../services/fx'

defineOptions({ name: 'CostRenewalPage' })

const nodesStore = useNodesStore()
const { rates, source, date, loading: fxLoading, sourceLabel, fetchRates } = useFxRates()
const refreshing = ref(false)

async function handleRefresh() {
  if (refreshing.value || fxLoading.value) return
  refreshing.value = true
  const minDelay = new Promise(resolve => setTimeout(resolve, 600))
  try {
    await Promise.allSettled([
      fetchRates(true),
      refreshAllNodes(),
      minDelay,
    ])
  }
  finally {
    refreshing.value = false
  }
}

onMounted(() => {
  void fetchRates()
})

const normalizedNodes = computed(() =>
  nodesStore.nodes.map(node => normalizeNodeCost(node, rates.value)),
)

const summary = computed(() =>
  calculateCostRenewalSummary(
    nodesStore.nodes,
    rates.value,
    source.value,
    date.value,
    30,
  ),
)
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-4 py-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2">
          <RouterLink
            :to="{ name: 'home' }"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon icon="lucide:arrow-left" class="size-3.5" />
            返回首页
          </RouterLink>
        </div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Cost & Renewal
        </p>
        <h1 class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          成本与续费
        </h1>
        <p class="mt-1 text-xs text-muted-foreground sm:text-sm">
          多币种自动汇率折算、月均与年化成本统计、以及集群续费时间线。
        </p>
      </div>

      <!-- FX Status Bar -->
      <div class="flex items-center gap-2 self-start rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-xs sm:self-auto">
        <div class="flex items-center gap-1.5 text-muted-foreground">
          <span class="size-2 rounded-full bg-emerald-500" />
          <span>{{ sourceLabel }}</span>
          <span class="text-[10px] text-muted-foreground/80">({{ date }})</span>
        </div>
        <button
          type="button"
          class="ml-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
          :disabled="refreshing || fxLoading"
          title="刷新汇率与节点成本数据"
          @click="handleRefresh"
        >
          <Icon
            icon="lucide:refresh-cw"
            class="size-3.5"
            :class="refreshing || fxLoading ? 'animate-spin' : ''"
          />
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="space-y-6">
      <!-- Top 4 Summary Cards -->
      <CostSummaryCards :summary="summary" :loading="fxLoading" />

      <!-- Renewal Timeline -->
      <RenewalTimeline :nodes="normalizedNodes" :loading="fxLoading" />

      <!-- Detailed Node Cost Table -->
      <NodeCostTable :nodes="normalizedNodes" :loading="fxLoading" />
    </div>
  </div>
</template>
