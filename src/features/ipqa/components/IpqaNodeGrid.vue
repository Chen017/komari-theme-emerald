<script setup lang="ts">
import type { IpqaNodeOverview } from '../types'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getRiskColor, getRiskLabel } from '../formatters'

const props = defineProps<{
  nodes: IpqaNodeOverview[]
}>()

// Card active IP version state: node.uuid -> 'v4' | 'v6'
const cardIpVersion = ref<Record<string, 'v4' | 'v6'>>({})

function getActiveVersion(node: IpqaNodeOverview): 'v4' | 'v6' {
  if (cardIpVersion.value[node.uuid]) {
    return cardIpVersion.value[node.uuid]!
  }
  // Default to v4 if available, otherwise v6
  return node.has_ipv4 ? 'v4' : (node.has_ipv6 ? 'v6' : 'v4')
}

function setCardVersion(node: IpqaNodeOverview, version: 'v4' | 'v6') {
  if (version === 'v4' && !node.has_ipv4) return
  if (version === 'v6' && !node.has_ipv6) return
  cardIpVersion.value[node.uuid] = version
}

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

function getActiveDate(node: IpqaNodeOverview): string {
  const ver = getActiveVersion(node)
  if (ver === 'v4' && node.v4?.date) return node.v4.date
  if (ver === 'v6' && node.v6?.date) return node.v6.date
  return node.latest_date || '无'
}

function getActiveRisk(node: IpqaNodeOverview): { category: any, source: string } {
  const ver = getActiveVersion(node)
  if (ver === 'v4' && node.v4?.risk) return node.v4.risk
  if (ver === 'v6' && node.v6?.risk) return node.v6.risk
  return node.highest_risk
}

function findMedia(node: IpqaNodeOverview, ...names: string[]) {
  const ver = getActiveVersion(node)
  const activeProto = ver === 'v4' ? node.v4 : node.v6
  const fallbackProto = ver === 'v4' ? node.v6 : node.v4

  for (const n of names) {
    const lower = n.toLowerCase()
    if (activeProto?.media) {
      for (const [k, v] of Object.entries(activeProto.media)) {
        if (k.toLowerCase() === lower || k.toLowerCase().includes(lower)) {
          return v
        }
      }
    }
    // Fallback to media_summary
    for (const [k, v] of Object.entries(node.media_summary || {})) {
      if (k.toLowerCase() === lower || k.toLowerCase().includes(lower)) {
        return v
      }
    }
    if (fallbackProto?.media) {
      for (const [k, v] of Object.entries(fallbackProto.media)) {
        if (k.toLowerCase() === lower || k.toLowerCase().includes(lower)) {
          return v
        }
      }
    }
  }
  return null
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <div
      v-for="node in nodes"
      :key="node.uuid"
      class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs flex flex-col justify-between hover:border-emerald-500/50 transition-colors"
    >
      <!-- Top: Node Name & Status -->
      <div>
        <!-- Header: Name & Status -->
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-semibold text-sm text-neutral-800 dark:text-neutral-100 truncate">
            {{ node.name }}
          </h4>
          <span
            class="text-[11px] px-2 py-0.5 rounded-full font-medium"
            :class="getStatusBadge(node.status).color"
          >
            {{ getStatusBadge(node.status).label }}
          </span>
        </div>

        <!-- Meta row: Date & IP version toggle buttons -->
        <div class="flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 mb-3">
          <span>存档: {{ getActiveDate(node) }}</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="text-[10px] px-2 py-0.5 rounded font-mono font-medium transition-all"
              :class="[
                getActiveVersion(node) === 'v4'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : node.has_ipv4
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer'
                    : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 opacity-40 cursor-not-allowed',
              ]"
              :disabled="!node.has_ipv4"
              :title="node.has_ipv4 ? '切换到 IPv4 存档' : '该节点无 IPv4 存档'"
              @click="setCardVersion(node, 'v4')"
            >
              v4
            </button>
            <button
              type="button"
              class="text-[10px] px-2 py-0.5 rounded font-mono font-medium transition-all"
              :class="[
                getActiveVersion(node) === 'v6'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : node.has_ipv6
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer'
                    : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 opacity-40 cursor-not-allowed',
              ]"
              :disabled="!node.has_ipv6"
              :title="node.has_ipv6 ? '切换到 IPv6 存档' : '该节点无 IPv6 存档'"
              @click="setCardVersion(node, 'v6')"
            >
              v6
            </button>
          </div>
        </div>

        <!-- Risk Category Badge -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-xs text-neutral-400 dark:text-neutral-500">风控评级</span>
          <div
            class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-lg border"
            :class="[
              getRiskColor(getActiveRisk(node).category).bg,
              getRiskColor(getActiveRisk(node).category).text,
              getRiskColor(getActiveRisk(node).category).border,
            ]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="getRiskColor(getActiveRisk(node).category).dot" />
            <span>{{ getRiskLabel(getActiveRisk(node).category) }}</span>
            <span v-if="getActiveRisk(node).source !== 'None'" class="text-[10px] opacity-70">
              ({{ getActiveRisk(node).source }})
            </span>
          </div>
        </div>

        <!-- Media & AI Highlights -->
        <div class="space-y-1.5 mb-3 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-neutral-400 dark:text-neutral-500">流媒体:</span>
            <div class="flex items-center gap-1.5 flex-wrap justify-end">
              <!-- YouTube -->
              <span
                v-if="findMedia(node, 'YouTube', 'Youtube')"
                class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                :class="findMedia(node, 'YouTube', 'Youtube')?.unlocked ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
              >
                YouTube{{ findMedia(node, 'YouTube', 'Youtube')?.region ? ` [${findMedia(node, 'YouTube', 'Youtube')?.region}]` : '' }}
              </span>
              <!-- TikTok -->
              <span
                v-if="findMedia(node, 'TikTok', 'tiktok')"
                class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                :class="findMedia(node, 'TikTok', 'tiktok')?.unlocked ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
              >
                TikTok{{ findMedia(node, 'TikTok', 'tiktok')?.region ? ` [${findMedia(node, 'TikTok', 'tiktok')?.region}]` : '' }}
              </span>
              <!-- Reddit -->
              <span
                v-if="findMedia(node, 'Reddit', 'reddit')"
                class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                :class="findMedia(node, 'Reddit', 'reddit')?.unlocked ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
              >
                Reddit{{ findMedia(node, 'Reddit', 'reddit')?.region ? ` [${findMedia(node, 'Reddit', 'reddit')?.region}]` : '' }}
              </span>
              <!-- GPT -->
              <span
                v-if="node.ai_summary.ChatGPT || findMedia(node, 'ChatGPT', 'chatgpt')"
                class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                :class="(node.ai_summary.ChatGPT?.unlocked || findMedia(node, 'ChatGPT', 'chatgpt')?.unlocked) ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'"
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
