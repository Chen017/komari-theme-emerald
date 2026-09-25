<script setup lang="ts">
import type { IpqaNodeOverview } from '../types'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import { findProtocolOverviewService } from '../overviewSelectors'

defineProps<{
  nodes: IpqaNodeOverview[]
}>()

const selectedIpVersion = ref<'v4' | 'v6'>('v4')

const services = [
  { keys: ['YouTube', 'Youtube', 'youtube'], label: 'YouTube' },
  { keys: ['Netflix', 'netflix'], label: 'Netflix' },
  { keys: ['DisneyPlus', 'disney+', 'Disney+'], label: 'Disney+' },
  { keys: ['AmazonPrimeVideo', 'amazonpv', 'amazon', 'primevideo'], label: 'Prime Video' },
  { keys: ['TikTok', 'tiktok'], label: 'TikTok' },
  { keys: ['Reddit', 'reddit'], label: 'Reddit' },
  { keys: ['ChatGPT', 'chatgpt', 'OpenAI'], label: 'ChatGPT', isAi: true },
]

function getMediaUnlock(node: IpqaNodeOverview, serviceKeys: string[], isAi: boolean, ipVer: 'v4' | 'v6') {
  return findProtocolOverviewService(node, ipVer, serviceKeys, isAi ? 'ai' : 'media')
}
</script>

<template>
  <div class="p-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200/80 dark:border-neutral-800 flex flex-col h-full">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:tv" class="w-4 h-4 text-emerald-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          流媒体与 AI 解锁能力矩阵
        </h4>
      </div>

      <!-- v4 / v6 toggle -->
      <div class="flex items-center rounded-md bg-neutral-200/60 dark:bg-neutral-800 p-0.5" role="group">
        <button
          type="button"
          class="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
          :class="selectedIpVersion === 'v4' ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-300 shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
          @click="selectedIpVersion = 'v4'"
        >
          IPv4
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
          :class="selectedIpVersion === 'v6' ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-300 shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
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
            <th v-for="s in services" :key="s.label" class="py-2 px-2 font-medium whitespace-nowrap">
              {{ s.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/40">
          <tr v-for="node in nodes" :key="node.uuid" class="hover:bg-white/50 dark:hover:bg-neutral-800/50 transition-colors">
            <td class="py-2.5 pr-3 font-medium text-neutral-800 dark:text-neutral-200 max-w-[120px] truncate">
              {{ node.name }}
            </td>
            <td v-for="s in services" :key="s.label" class="py-2.5 px-2 whitespace-nowrap">
              <template v-if="getMediaUnlock(node, s.keys, Boolean(s.isAi), selectedIpVersion).available">
                <span
                  v-if="getMediaUnlock(node, s.keys, Boolean(s.isAi), selectedIpVersion).unlocked"
                  class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"
                >
                  <Icon icon="lucide:check" class="w-3.5 h-3.5" />
                  <span v-if="getMediaUnlock(node, s.keys, Boolean(s.isAi), selectedIpVersion).region" class="text-[10px]">
                    [{{ getMediaUnlock(node, s.keys, Boolean(s.isAi), selectedIpVersion).region }}]
                  </span>
                </span>
                <span v-else class="text-rose-500 dark:text-rose-400">
                  <Icon icon="lucide:x" class="w-3.5 h-3.5" />
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
