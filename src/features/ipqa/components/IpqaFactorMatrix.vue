<script setup lang="ts">
import type { IpqaNormalizedReport } from '../types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const props = defineProps<{
  report: IpqaNormalizedReport
}>()

const factorKeys = computed(() => Object.keys(props.report.factors))

const allEngines = computed(() => {
  const set = new Set<string>()
  for (const fk of factorKeys.value) {
    const obj = props.report.factors[fk] || {}
    Object.keys(obj).forEach(e => set.add(e))
  }
  return Array.from(set).sort()
})
</script>

<template>
  <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
    <div class="flex items-center gap-2 mb-3">
      <Icon icon="lucide:sliders-horizontal" class="w-4 h-4 text-indigo-500" />
      <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
        风险因子检测矩阵 (Risk Factors)
      </h4>
    </div>

    <div v-if="factorKeys.length === 0" class="text-xs text-neutral-400 py-4 text-center">
      暂无风险因子检测数据
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-xs text-left">
        <thead>
          <tr class="border-b border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500">
            <th class="py-2 pr-3 font-medium">风险因子</th>
            <th v-for="eng in allEngines" :key="eng" class="py-2 px-2 font-medium whitespace-nowrap">
              {{ eng }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/40">
          <tr v-for="fk in factorKeys" :key="fk" class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors">
            <td class="py-2.5 pr-3 font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
              {{ fk }}
            </td>
            <td v-for="eng in allEngines" :key="eng" class="py-2.5 px-2 whitespace-nowrap">
              <template v-if="report.factors[fk]?.[eng] !== undefined">
                <span
                  v-if="report.factors[fk]![eng] === true"
                  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  <Icon icon="lucide:alert-triangle" class="w-3 h-3" />
                  <span>检出</span>
                </span>
                <span
                  v-else-if="report.factors[fk]![eng] === false"
                  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <Icon icon="lucide:check" class="w-3 h-3" />
                  <span>正常</span>
                </span>
                <span v-else class="text-[10px] text-neutral-400">
                  {{ report.factors[fk]![eng] }}
                </span>
              </template>
              <span v-else class="text-neutral-300 dark:text-neutral-600">--</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
