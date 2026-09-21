<script setup lang="ts">
import type { IpqaNodeOverview } from '../types'
import { Icon } from '@iconify/vue'
import { RouterLink } from 'vue-router'
import { getRiskColor, getRiskLabel } from '../formatters'

defineProps<{
  nodes: IpqaNodeOverview[]
}>()

function getStatusBadge(status: string): { label: string, color: string } {
  switch (status) {
    case 'ok':
      return { label: '运行正常', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
    case 'not_installed':
      return { label: '未安装', color: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' }
    case 'no_archive':
      return { label: '暂无归档', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
    case 'stale':
      return { label: '归档过期', color: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' }
    case 'collection_error':
      return { label: '采集异常', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' }
    default:
      return { label: '未知', color: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' }
  }
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    <div
      v-for="node in nodes"
      :key="node.uuid"
      class="p-4 rounded-xl bg-white dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-800 flex flex-col justify-between transition-all hover:border-neutral-300 dark:hover:border-neutral-700"
    >
      <!-- Top: Node Name & Status -->
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="font-semibold text-neutral-800 dark:text-neutral-100 truncate text-sm">
            {{ node.name }}
          </div>
          <span
            class="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
            :class="getStatusBadge(node.status).color"
          >
            {{ getStatusBadge(node.status).label }}
          </span>
        </div>

        <!-- Meta row: Date & IP versions -->
        <div class="flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 mb-3">
          <span>存档: {{ node.latest_date || '无' }}</span>
          <div class="flex items-center gap-1">
            <span
              class="text-[10px] px-1.5 py-0.2 rounded font-mono"
              :class="node.has_ipv4 ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
            >
              v4
            </span>
            <span
              class="text-[10px] px-1.5 py-0.2 rounded font-mono"
              :class="node.has_ipv6 ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
            >
              v6
            </span>
          </div>
        </div>

        <!-- Risk Category Badge -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-xs text-neutral-400 dark:text-neutral-500">风控评级</span>
          <div
            class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-lg border"
            :class="[getRiskColor(node.highest_risk.category).bg, getRiskColor(node.highest_risk.category).text, getRiskColor(node.highest_risk.category).border]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="getRiskColor(node.highest_risk.category).dot" />
            <span>{{ getRiskLabel(node.highest_risk.category) }}</span>
            <span v-if="node.highest_risk.source !== 'None'" class="text-[10px] opacity-70">
              ({{ node.highest_risk.source }})
            </span>
          </div>
        </div>

        <!-- Media & AI Highlights -->
        <div class="space-y-1.5 mb-3 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-neutral-400 dark:text-neutral-500">流媒体:</span>
            <div class="flex items-center gap-1.5">
              <span
                v-if="node.media_summary.Netflix"
                class="text-[10px] px-1.5 py-0.5 rounded"
                :class="node.media_summary.Netflix.unlocked ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
              >
                NF{{ node.media_summary.Netflix.region ? ` [${node.media_summary.Netflix.region}]` : '' }}
              </span>
              <span
                v-if="node.media_summary.Youtube"
                class="text-[10px] px-1.5 py-0.5 rounded"
                :class="node.media_summary.Youtube.unlocked ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
              >
                YT{{ node.media_summary.Youtube.region ? ` [${node.media_summary.Youtube.region}]` : '' }}
              </span>
              <span
                v-if="node.ai_summary.ChatGPT"
                class="text-[10px] px-1.5 py-0.5 rounded"
                :class="node.ai_summary.ChatGPT.unlocked ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
              >
                GPT
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer: Changes & Link -->
      <div class="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
        <span class="text-[11px] text-neutral-400 dark:text-neutral-500">
          今日变动: {{ node.changes_today }} 项
        </span>
        <RouterLink
          :to="`/ip-quality/${node.uuid}`"
          class="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
        >
          <span>查看详情</span>
          <Icon icon="lucide:arrow-right" class="w-3.5 h-3.5" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>
