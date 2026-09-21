<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'

defineProps<{
  nodes: readonly NodeData[]
}>()
</script>

<template>
  <div class="bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl p-5 shadow-xs">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Icon icon="lucide:shield-check" class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">
              IP 质量与归档概览
            </h3>
            <span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
              IPQA
            </span>
          </div>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            涵盖多维度风险评分、流媒体/AI 解锁矩阵、邮件信誉及每日归档差异追踪
          </p>
        </div>
      </div>
    </div>

    <!-- Content Placeholder for Phase 5 -->
    <div class="py-8 px-4 flex flex-col items-center justify-center text-center rounded-xl bg-neutral-50/50 dark:bg-neutral-800/20 border border-dashed border-neutral-200 dark:border-neutral-800">
      <div class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-3">
        <Icon icon="lucide:database-zap" class="w-6 h-6" />
      </div>
      <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        IPQA 归档数据模块就绪中
      </div>
      <p class="text-xs text-neutral-400 dark:text-neutral-500 max-w-md">
        将在插件后端（Phase 4）提供归档读取 API 后，实时展现各节点的欺诈分、流媒体/ChatGPT 状态及历史差异变更。
      </p>
    </div>
  </div>
</template>
