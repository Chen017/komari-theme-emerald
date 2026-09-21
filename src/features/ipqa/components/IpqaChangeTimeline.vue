<script setup lang="ts">
import type { IpqaSemanticChange } from '../types'
import { Icon } from '@iconify/vue'

defineProps<{
  changes: IpqaSemanticChange[]
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
  <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:history" class="w-4 h-4 text-emerald-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          历史属性与风险变动记录
        </h4>
      </div>
      <span class="text-[11px] text-neutral-400 dark:text-neutral-500">
        共 {{ changes.length }} 条变动
      </span>
    </div>

    <div v-if="changes.length === 0" class="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
      <Icon icon="lucide:shield-check" class="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-500" />
      <span>该节点在所选历史周期内未检出属性或评级变动，保持稳定。</span>
    </div>

    <div v-else class="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
      <div
        v-for="(change, idx) in changes"
        :key="idx"
        class="p-3 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60 text-xs"
      >
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <span class="font-medium text-neutral-800 dark:text-neutral-200">
              {{ change.date }}
            </span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 font-mono">
              {{ change.ipVersion }}
            </span>
            <span
              class="text-[10px] px-1.5 py-0.2 rounded font-medium"
              :class="getSeverityBadge(change.severity).color"
            >
              {{ getSeverityBadge(change.severity).label }}
            </span>
          </div>
          <span class="text-[11px] text-neutral-400 font-mono">
            {{ change.field }}
          </span>
        </div>

        <div class="text-neutral-700 dark:text-neutral-300 font-medium">
          {{ change.description }}
        </div>

        <div v-if="change.before !== undefined && change.after !== undefined" class="mt-1 flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
          <span>原值: {{ String(change.before) }}</span>
          <span>→</span>
          <span class="text-neutral-600 dark:text-neutral-200">新值: {{ String(change.after) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
