<script setup lang="ts">
import type { IpqaNodeOverview } from '../types'
import { Icon } from '@iconify/vue'

defineProps<{
  nodes: IpqaNodeOverview[]
}>()

const services = [
  { key: 'Netflix', label: 'Netflix' },
  { key: 'Youtube', label: 'YouTube' },
  { key: 'DisneyPlus', label: 'Disney+' },
  { key: 'ChatGPT', label: 'ChatGPT', isAi: true },
  { key: 'TikTok', label: 'TikTok' },
]
</script>

<template>
  <div class="p-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200/80 dark:border-neutral-800 flex flex-col h-full">
    <div class="flex items-center gap-2 mb-3">
      <Icon icon="lucide:tv" class="w-4 h-4 text-emerald-500" />
      <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
        流媒体与 AI 解锁能力矩阵
      </h4>
    </div>

    <div class="overflow-x-auto flex-1">
      <table class="w-full text-xs text-left">
        <thead>
          <tr class="border-b border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500">
            <th class="py-2 pr-3 font-medium">节点</th>
            <th v-for="s in services" :key="s.key" class="py-2 px-2 font-medium whitespace-nowrap">
              {{ s.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/40">
          <tr v-for="node in nodes" :key="node.uuid" class="hover:bg-white/50 dark:hover:bg-neutral-800/50 transition-colors">
            <td class="py-2.5 pr-3 font-medium text-neutral-800 dark:text-neutral-200 max-w-[120px] truncate">
              {{ node.name }}
            </td>
            <td v-for="s in services" :key="s.key" class="py-2.5 px-2 whitespace-nowrap">
              <template v-if="node.status === 'ok'">
                <template v-if="s.isAi">
                  <span
                    v-if="node.ai_summary[s.key]?.unlocked"
                    class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"
                  >
                    <Icon icon="lucide:check" class="w-3.5 h-3.5" />
                    <span v-if="node.ai_summary[s.key]?.region" class="text-[10px]">
                      [{{ node.ai_summary[s.key]?.region }}]
                    </span>
                  </span>
                  <span v-else class="text-rose-500 dark:text-rose-400">
                    <Icon icon="lucide:x" class="w-3.5 h-3.5" />
                  </span>
                </template>
                <template v-else>
                  <span
                    v-if="node.media_summary[s.key]?.unlocked"
                    class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"
                  >
                    <Icon icon="lucide:check" class="w-3.5 h-3.5" />
                    <span v-if="node.media_summary[s.key]?.region" class="text-[10px]">
                      [{{ node.media_summary[s.key]?.region }}]
                    </span>
                  </span>
                  <span v-else class="text-rose-500 dark:text-rose-400">
                    <Icon icon="lucide:x" class="w-3.5 h-3.5" />
                  </span>
                </template>
              </template>
              <span v-else class="text-neutral-300 dark:text-neutral-600">--</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
