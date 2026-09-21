<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { useUptime30d } from '../composables/useUptime30d'

const props = defineProps<{
  nodes: readonly NodeData[]
}>()

const {
  fleetUptime,
  loading,
  error,
  refresh,
} = useUptime30d({
  nodes: () => props.nodes,
})
</script>

<template>
  <div class="bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl p-5 shadow-xs flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Icon icon="lucide:activity" class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">
              近 30 天在线率
            </h3>
            <span
              v-if="fleetUptime.fleetUptimeRatio !== null"
              class="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100/70 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              Fleet {{ fleetUptime.fleetUptimeText }}
            </span>
          </div>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            按历史状态采样与在线心跳综合评估
          </p>
        </div>
      </div>

      <button
        class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="刷新在线率"
        :disabled="loading"
        @click="refresh"
      >
        <Icon
          icon="lucide:refresh-cw"
          class="w-4 h-4"
          :class="{ 'animate-spin': loading }"
        />
      </button>
    </div>

    <!-- Error notice -->
    <div
      v-if="error"
      class="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2"
    >
      <Icon icon="lucide:alert-circle" class="w-4 h-4 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <!-- Node list -->
    <div class="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-2 divide-y divide-neutral-100 dark:divide-neutral-800/40">
      <div
        v-if="fleetUptime.nodes.length === 0"
        class="h-48 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 text-xs"
      >
        <Icon icon="lucide:server-off" class="w-8 h-8 mb-2 opacity-40" />
        <span>暂无节点在线数据</span>
      </div>

      <div
        v-for="node in fleetUptime.nodes"
        :key="node.uuid"
        class="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs"
      >
        <!-- Node info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="node.uptimeRatio !== null && node.uptimeRatio > 0 ? 'bg-emerald-500' : 'bg-rose-500'"
            />
            <span class="font-medium text-neutral-800 dark:text-neutral-200 truncate">
              {{ node.name }}
            </span>
          </div>

          <!-- Progress bar -->
          <div class="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="node.uptimeRatio !== null && node.uptimeRatio >= 0.99 ? 'bg-emerald-500' : (node.uptimeRatio !== null && node.uptimeRatio >= 0.95 ? 'bg-amber-500' : 'bg-rose-500')"
              :style="{ width: `${(node.uptimeRatio ?? 0) * 100}%` }"
            />
          </div>
        </div>

        <!-- Uptime & Coverage -->
        <div class="text-right shrink-0">
          <div class="font-semibold text-neutral-800 dark:text-neutral-200">
            {{ node.uptimeText }}
          </div>
          <div
            class="text-[11px]"
            :class="{
              'text-emerald-600 dark:text-emerald-400': node.status === 'complete',
              'text-amber-600 dark:text-amber-400': node.status === 'partial',
              'text-neutral-400 dark:text-neutral-500': node.status === 'unavailable',
            }"
          >
            {{ node.coverageText }}
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Stats -->
    <div class="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
      <span>完整覆盖: {{ fleetUptime.completeNodes }} / {{ fleetUptime.totalNodes }} 台</span>
      <span v-if="fleetUptime.partialNodes > 0" class="text-amber-600 dark:text-amber-400">
        部分历史: {{ fleetUptime.partialNodes }} 台
      </span>
      <span v-if="fleetUptime.unavailableNodes > 0" class="text-neutral-400">
        无采样: {{ fleetUptime.unavailableNodes }} 台
      </span>
    </div>
  </div>
</template>
