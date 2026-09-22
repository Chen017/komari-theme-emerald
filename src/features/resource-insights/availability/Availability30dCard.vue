<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { useAvailability30d } from './useAvailability30d'

const props = defineProps<{
  nodes: readonly NodeData[]
}>()

const {
  state,
  errorMessage,
  fleetView,
  refresh,
} = useAvailability30d({
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
              v-if="fleetView.fleetUptimeRatio !== null"
              class="text-xs font-medium px-2 py-0.5 rounded-full transition-colors bg-emerald-100/70 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              Fleet {{ fleetView.fleetUptimeText }}
            </span>
          </div>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            基于 WebSocket 实时在线事件账本精确统计
          </p>
        </div>
      </div>

      <button
        class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="刷新在线率"
        :disabled="state === 'loading'"
        @click="refresh"
      >
        <Icon
          icon="lucide:refresh-cw"
          class="w-4 h-4"
          :class="{ 'animate-spin': state === 'loading' }"
        />
      </button>
    </div>

    <!-- Plugin Missing / Unsupported Notice -->
    <div
      v-if="state === 'unsupported'"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs"
    >
      <div class="p-3 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-3">
        <Icon icon="lucide:plug-zap" class="w-8 h-8" />
      </div>
      <p class="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        在线率历史不可用
      </p>
      <p class="text-neutral-400 dark:text-neutral-500 max-w-[260px] mb-3">
        安装 Availability History 插件后即可开始记录精确在线率历史。
      </p>
      <a
        href="https://github.com/Chen017/komari-plugin-availability-history"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium transition-colors"
      >
        <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
        <span>查看安装说明</span>
      </a>
    </div>

    <!-- Error notice -->
    <div
      v-else-if="state === 'error'"
      class="mb-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"
    >
      <Icon icon="lucide:alert-circle" class="w-4 h-4 shrink-0" />
      <span>{{ errorMessage || '在线率获取失败' }}</span>
    </div>

    <!-- Node list -->
    <div
      v-if="state !== 'unsupported'"
      class="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-2 divide-y divide-neutral-100 dark:divide-neutral-800/40"
    >
      <div
        v-if="fleetView.nodes.length === 0"
        class="h-48 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 text-xs"
      >
        <Icon icon="lucide:server-off" class="w-8 h-8 mb-2 opacity-40" />
        <span>暂无节点在线数据</span>
      </div>

      <div
        v-for="node in fleetView.nodes"
        :key="node.uuid"
        class="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs"
      >
        <!-- Node info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="node.isLiveOnline ? 'bg-emerald-500' : 'bg-rose-500'"
              :title="node.isLiveOnline ? '当前在线' : '当前离线'"
            />
            <span class="font-medium text-neutral-800 dark:text-neutral-200 truncate">
              {{ node.name }}
            </span>
          </div>

          <!-- Progress bar -->
          <div class="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="node.uptimeRatio !== null && node.uptimeRatio >= 0.99 ? 'bg-emerald-500' : (node.uptimeRatio !== null && node.uptimeRatio >= 0.95 ? 'bg-amber-500' : (node.uptimeRatio !== null ? 'bg-rose-500' : 'bg-transparent'))"
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
              'text-emerald-600 dark:text-emerald-400': node.hasData && node.coverageDays >= 28,
              'text-amber-600 dark:text-amber-400': node.hasData && node.coverageDays >= 1 && node.coverageDays < 28,
              'text-neutral-400 dark:text-neutral-500': !node.hasData || node.coverageDays < 1,
            }"
          >
            {{ node.coverageText }}
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Stats -->
    <div
      v-if="state !== 'unsupported'"
      class="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500"
    >
      <span>跟踪节点: {{ fleetView.coveredNodes }} / {{ fleetView.totalNodes }} 台</span>
      <span :class="fleetView.fleetUptimeRatio !== null ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-500'">
        30 天在线率 {{ fleetView.fleetUptimeText }}
      </span>
    </div>
  </div>
</template>
