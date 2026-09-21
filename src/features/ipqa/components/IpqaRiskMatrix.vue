<script setup lang="ts">
import type { IpqaNodeOverview } from '../types'
import { Icon } from '@iconify/vue'

defineProps<{
  nodes: IpqaNodeOverview[]
}>()

const providers = [
  { key: 'IP2LOCATION', label: 'IP2Location' },
  { key: 'SCAMALYTICS', label: 'Scamalytics' },
  { key: 'ipapi', label: 'ipapi' },
  { key: 'AbuseIPDB', label: 'AbuseIPDB' },
  { key: 'IPQS', label: 'IPQualityScore' },
  { key: 'DBIP', label: 'DB-IP' },
]
</script>

<template>
  <div class="p-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200/80 dark:border-neutral-800 flex flex-col h-full">
    <div class="flex items-center gap-2 mb-3">
      <Icon icon="lucide:shield" class="w-4 h-4 text-indigo-500" />
      <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
        风控数据库评分矩阵
      </h4>
    </div>

    <div class="overflow-x-auto flex-1">
      <table class="w-full text-xs text-left">
        <thead>
          <tr class="border-b border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500">
            <th class="py-2 pr-3 font-medium">节点</th>
            <th v-for="p in providers" :key="p.key" class="py-2 px-2 font-medium whitespace-nowrap">
              {{ p.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/40">
          <tr v-for="node in nodes" :key="node.uuid" class="hover:bg-white/50 dark:hover:bg-neutral-800/50 transition-colors">
            <td class="py-2.5 pr-3 font-medium text-neutral-800 dark:text-neutral-200 max-w-[120px] truncate">
              {{ node.name }}
            </td>
            <td v-for="p in providers" :key="p.key" class="py-2.5 px-2 whitespace-nowrap">
              <span
                v-if="node.status === 'ok'"
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                :class="node.highest_risk.source.includes(p.key) ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-bold' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'"
              >
                {{ node.highest_risk.source.includes(p.key) ? node.highest_risk.category : '良好' }}
              </span>
              <span v-else class="text-neutral-300 dark:text-neutral-600">--</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
