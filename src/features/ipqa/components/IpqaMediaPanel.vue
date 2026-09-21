<script setup lang="ts">
import type { IpqaNormalizedReport } from '../types'
import { Icon } from '@iconify/vue'

defineProps<{
  report: IpqaNormalizedReport
}>()

function getMediaBadge(status?: string): { label: string, color: string } {
  if (!status) return { label: '未检测', color: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800' }
  if (status.includes('解锁') || status.includes('Yes')) {
    return { label: status, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' }
  }
  if (status.includes('仅自制')) {
    return { label: status, color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' }
  }
  return { label: status, color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' }
}
</script>

<template>
  <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
    <div class="flex items-center gap-2 mb-3">
      <Icon icon="lucide:tv-2" class="w-4 h-4 text-emerald-500" />
      <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
        流媒体与 AI 平台解锁状态
      </h4>
    </div>

    <div v-if="Object.keys(report.media).length === 0" class="text-xs text-neutral-400 py-4 text-center">
      暂无流媒体解锁测试数据
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
      <div
        v-for="(serviceData, serviceName) in report.media"
        :key="serviceName"
        class="p-3 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60 flex flex-col justify-between"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-neutral-800 dark:text-neutral-200">
            {{ serviceName }}
          </span>
          <span
            v-if="serviceData.region"
            class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold"
          >
            [{{ serviceData.region }}]
          </span>
        </div>

        <div>
          <span
            class="inline-block px-2 py-0.5 rounded text-[11px] font-medium"
            :class="getMediaBadge(serviceData.status).color"
          >
            {{ getMediaBadge(serviceData.status).label }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
