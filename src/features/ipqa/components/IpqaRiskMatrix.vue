<script setup lang="ts">
import type { IpqaNodeOverview } from '../types'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import { evaluateProviderScore } from '../formatters'

defineProps<{
  nodes: IpqaNodeOverview[]
}>()

const selectedIpVersion = ref<'v4' | 'v6'>('v4')

const providers = [
  { key: 'IP2LOCATION', label: 'IP2Location' },
  { key: 'SCAMALYTICS', label: 'Scamalytics' },
  { key: 'ipapi', label: 'ipapi' },
  { key: 'AbuseIPDB', label: 'AbuseIPDB' },
  { key: 'IPQS', label: 'IPQualityScore' },
  { key: 'DBIP', label: 'DB-IP' },
]

function getProviderScore(node: IpqaNodeOverview, providerKey: string, ipVer: 'v4' | 'v6'): { text: string, cls: string } {
  const hasVer = ipVer === 'v4' ? node.has_ipv4 : node.has_ipv6
  if (!hasVer) {
    return { text: '--', cls: 'text-neutral-300 dark:text-neutral-600' }
  }

  const proto = ipVer === 'v4' ? node.v4 : node.v6
  const scores = proto?.scores || {}
  let val: unknown = undefined
  for (const [k, v] of Object.entries(scores)) {
    if (k.toLowerCase() === providerKey.toLowerCase() || k.toLowerCase().includes(providerKey.toLowerCase())) {
      val = v
      break
    }
  }

  if (val === undefined) {
    return { text: 'null', cls: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 font-mono' }
  }

  const res = evaluateProviderScore(providerKey, val)
  return { text: res.text, cls: res.cls }
}
</script>

<template>
  <div class="p-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200/80 dark:border-neutral-800 flex flex-col h-full">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:shield" class="w-4 h-4 text-indigo-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          风控数据库评分矩阵
        </h4>
      </div>
      <!-- v4 / v6 toggle -->
      <div class="flex items-center rounded-md bg-neutral-200/60 dark:bg-neutral-800 p-0.5" role="group">
        <button
          type="button"
          class="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
          :class="selectedIpVersion === 'v4' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
          @click="selectedIpVersion = 'v4'"
        >
          IPv4
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
          :class="selectedIpVersion === 'v6' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
          @click="selectedIpVersion = 'v6'"
        >
          IPv6
        </button>
      </div>
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
                class="inline-block px-1.5 py-0.5 rounded text-[10px]"
                :class="getProviderScore(node, p.key, selectedIpVersion).cls"
              >
                {{ getProviderScore(node, p.key, selectedIpVersion).text }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
