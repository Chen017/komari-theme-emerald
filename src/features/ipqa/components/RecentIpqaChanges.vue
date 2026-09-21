<script setup lang="ts">
import type { IpqaSemanticChange } from '../types'
import { Icon } from '@iconify/vue'
import { RouterLink } from 'vue-router'

defineProps<{
  changes: Array<IpqaSemanticChange & { nodeName: string }>
}>()

function getSeverityBadge(sev: string): { label: string, color: string } {
  switch (sev) {
    case 'CRITICAL':
      return { label: '关键变更', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' }
    case 'WARNING':
      return { label: '风险预警', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' }
    default:
      return { label: '状态提示', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' }
  }
}
</script>

<template>
  <div class="p-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200/80 dark:border-neutral-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:history" class="w-4 h-4 text-emerald-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          最近属性与风险变动
        </h4>
      </div>
      <span class="text-[11px] text-neutral-400 dark:text-neutral-500">
        共 {{ changes.length }} 项近期记录
      </span>
    </div>

    <div v-if="changes.length === 0" class="py-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
      <Icon icon="lucide:shield-check" class="w-6 h-6 mx-auto mb-1.5 opacity-40 text-emerald-500" />
      <span>所有节点 IP 质量与解锁状态保持稳定，暂无新增变动</span>
    </div>

    <div v-else class="space-y-2 max-h-[260px] overflow-y-auto pr-1">
      <RouterLink
        v-for="(change, idx) in changes"
        :key="idx"
        :to="`/ip-quality/${change.nodeUuid}?date=${change.date}`"
        class="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700/60 flex items-center justify-between gap-3 text-xs transition-colors hover:border-neutral-300 dark:hover:border-neutral-600 group"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {{ change.nodeName }}
            </span>
            <span class="text-[10px] px-1 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 font-mono">
              {{ change.ipVersion }}
            </span>
            <span
              class="text-[10px] px-1.5 py-0.2 rounded font-medium"
              :class="getSeverityBadge(change.severity).color"
            >
              {{ getSeverityBadge(change.severity).label }}
            </span>
          </div>
          <div class="text-neutral-600 dark:text-neutral-300 text-[11px] truncate">
            {{ change.description }}
          </div>
        </div>

        <div class="shrink-0 text-right text-[11px] text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors flex items-center gap-1">
          <span>{{ change.date }}</span>
          <Icon icon="lucide:chevron-right" class="w-3.5 h-3.5" />
        </div>
      </RouterLink>
    </div>
  </div>
</template>
