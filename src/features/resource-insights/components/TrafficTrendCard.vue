<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { TrafficRange } from '../services/trafficTrend'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { useAppStore } from '@/stores/app'
import { formatBytes } from '@/utils/helper'
import { useTrafficTrend } from '../composables/useTrafficTrend'
import '@/utils/echarts'

const props = defineProps<{
  nodes: readonly NodeData[]
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const {
  snapshot,
  loading,
  refreshing,
  selectedEntity,
  selectedRange,
  canUseSinceReset,
  resetWindow,
  capabilities,
  refresh,
} = useTrafficTrend({
  nodes: () => props.nodes,
  settings: () => appStore.publicSettings?.theme_settings,
})

const is30dDisabled = computed(() => {
  return (capabilities.value?.trafficRetentionDays ?? 30) < 30
})

const rangeOptions: Array<{ value: TrafficRange, label: string }> = [
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: 'since_reset', label: '自重置日' },
]

function getRangeTooltip(val: TrafficRange): string {
  if (val === 'since_reset') {
    if (selectedEntity.value === 'all')
      return '全部节点无法统一按重置日汇总'
    if (!canUseSinceReset.value)
      return '该节点未配置流量重置日\n可在节点 Tag 中添加 <TRD:18>'
    if (resetWindow.value)
      return `${resetWindow.value.startDate} – ${resetWindow.value.endDate} (重置日: 每月 ${resetWindow.value.resetDay} 日)`
    return '自上次重置日'
  }
  if (val === '30d') {
    if (is30dDisabled.value) {
      return `当前 Komari 仅保留 ${capabilities.value?.trafficRetentionDays ?? 1} 天流量历史\n30 天趋势需要至少 30 天 Metric Store retention`
    }
    return '近 30 天每日流量趋势'
  }
  return '近 7 天每日流量趋势'
}

const coverage30dText = computed(() => {
  if (selectedRange.value !== '30d') return ''
  const availableDays = snapshot.value.days.filter(d => d.totalBytes !== null).length
  return `历史覆盖 ${availableDays} / 30 天`
})

const chartOption = computed(() => {
  const days = snapshot.value.days
  const dates = days.map(d => d.date.slice(5)) // MM-DD
  const downloads = days.map(d => d.downloadBytes)
  const uploads = days.map(d => d.uploadBytes)
  const totals = days.map(d => d.totalBytes)

  const textColor = isDark.value ? '#94a3b8' : '#64748b'
  const splitLineColor = isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark.value ? '#1e293b' : '#ffffff',
      borderColor: isDark.value ? '#334155' : '#e2e8f0',
      textStyle: { color: isDark.value ? '#f8fafc' : '#0f172a', fontSize: 12 },
      formatter: (params: any[]) => {
        if (!params || params.length === 0)
          return ''
        const index = params[0].dataIndex
        const day = days[index]
        if (!day)
          return ''

        const qualityLabels: Record<string, string> = {
          complete: '完整采集',
          partial: '部分采集',
          estimated: '估算数据',
          missing: '无数据',
        }
        const qualityText = qualityLabels[day.quality] || day.quality

        let html = `<div style="font-weight:600;margin-bottom:4px;">${day.date} (${qualityText})</div>`
        if (day.quality === 'missing' && day.totalBytes === null) {
          html += `<div style="color:${textColor};font-size:11px;margin-top:2px;">该日暂无历史采集记录</div>`
          return html
        }
        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin:2px 0;">`
        html += `<span style="color:#10b981;">● 下行流量:</span><strong>${day.downloadBytes !== null ? formatBytes(day.downloadBytes) : '--'}</strong></div>`
        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin:2px 0;">`
        html += `<span style="color:#0ea5e9;">● 上行流量:</span><strong>${day.uploadBytes !== null ? formatBytes(day.uploadBytes) : '--'}</strong></div>`
        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px;border-top:1px solid ${splitLineColor};padding-top:4px;">`
        html += `<span style="color:#f59e0b;">● 每日总量:</span><strong>${day.totalBytes !== null ? formatBytes(day.totalBytes) : '--'}</strong></div>`
        return html
      },
    },
    legend: {
      data: ['下行流量', '上行流量', '总量趋势'],
      textStyle: { color: textColor, fontSize: 11 },
      right: 0,
      top: 0,
    },
    grid: {
      left: '1%',
      right: '2%',
      bottom: '3%',
      top: '18%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: splitLineColor } },
      axisLabel: { color: textColor, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: splitLineColor } },
      axisLabel: {
        color: textColor,
        fontSize: 10,
        formatter: (val: number) => formatBytes(val),
      },
    },
    series: [
      {
        name: '下行流量',
        type: 'bar',
        stack: 'traffic',
        barMaxWidth: 18,
        itemStyle: { color: '#10b981', borderRadius: [0, 0, 2, 2] },
        data: downloads,
      },
      {
        name: '上行流量',
        type: 'bar',
        stack: 'traffic',
        barMaxWidth: 18,
        itemStyle: { color: '#0ea5e9', borderRadius: [2, 2, 0, 0] },
        data: uploads,
      },
      {
        name: '总量趋势',
        type: 'line',
        smooth: true,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: '#f59e0b', width: 2 },
        itemStyle: { color: '#f59e0b' },
        data: totals,
      },
    ],
  }
})
</script>

<template>
  <div class="flex flex-col justify-between rounded-lg border border-border/70 bg-card/60 p-4 shadow-xs">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:activity" class="size-4 text-emerald-600 dark:text-emerald-400" />
        <h2 class="text-sm font-semibold text-foreground">
          每日流量趋势
        </h2>
        <span
          v-if="capabilities && capabilities.trafficRetentionDays < 30"
          class="text-xs text-amber-600 dark:text-amber-400 font-normal"
          :title="'如需 30 天历史，请在 Komari Metric Store 中将 traffic.up / traffic.down 保留时间调整为至少 30 天'"
        >
          (历史保留: {{ capabilities.trafficRetentionDays }}天)
        </span>
        <span
          v-if="selectedRange === 'since_reset' && resetWindow"
          class="text-xs text-muted-foreground font-normal"
        >
          ({{ resetWindow.startDate.slice(5) }} – {{ resetWindow.endDate.slice(5) }} · 每月 {{ resetWindow.resetDay }} 日重置)
        </span>
        <span
          v-else-if="selectedRange === '30d' && coverage30dText"
          class="text-xs text-muted-foreground font-normal"
        >
          ({{ coverage30dText }})
        </span>
      </div>

      <!-- Controls: Node Selector & Range -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Node selector -->
        <select
          v-model="selectedEntity"
          class="h-7 rounded border border-border/60 bg-background/80 px-2 text-xs text-foreground outline-none transition-colors hover:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          aria-label="选择节点"
        >
          <option value="all">
            全部节点汇总
          </option>
          <option v-for="node in nodes" :key="node.uuid" :value="node.uuid">
            {{ node.name }}
          </option>
        </select>

        <!-- Range Buttons -->
        <div class="flex items-center rounded-md bg-muted/60 p-0.5" role="group">
          <button
            v-for="opt in rangeOptions"
            :key="opt.value"
            type="button"
            :disabled="(opt.value === 'since_reset' && !canUseSinceReset) || (opt.value === '30d' && is30dDisabled)"
            :title="getRangeTooltip(opt.value)"
            class="rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="selectedRange === opt.value
              ? 'bg-background text-emerald-700 dark:text-emerald-300 shadow-xs'
              : 'text-muted-foreground hover:text-foreground'"
            @click="selectedRange = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <button
          type="button"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          :disabled="loading || refreshing"
          title="刷新流量数据"
          @click="refresh"
        >
          <Icon icon="lucide:refresh-cw" class="size-3.5" :class="refreshing ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- Chart Body -->
    <div class="relative min-h-64 w-full flex-1">
      <div v-if="loading && !refreshing" class="flex h-64 items-center justify-center">
        <Icon icon="lucide:loader-2" class="size-6 animate-spin text-emerald-600" />
      </div>

      <div
        v-else-if="snapshot.state === 'error' || snapshot.state === 'unsupported'"
        class="flex h-64 flex-col items-center justify-center text-xs text-destructive"
      >
        <Icon icon="lucide:alert-circle" class="mb-2 size-8 opacity-60" />
        <p>{{ snapshot.message }}</p>
      </div>

      <div
        v-else-if="snapshot.state === 'empty' || snapshot.days.length === 0"
        class="flex h-64 flex-col items-center justify-center text-xs text-muted-foreground"
      >
        <Icon icon="lucide:bar-chart-2" class="mb-2 size-8 opacity-40" />
        <p>{{ snapshot.message || '暂无历史流量记录' }}</p>
      </div>

      <div v-else class="h-64 w-full">
        <VChart :option="chartOption" autoresize style="width: 100%; height: 100%;" />
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
      <span>{{ snapshot.message }}</span>
      <span v-if="snapshot.sourceKind">来源: {{ snapshot.sourceKind === 'metrics' ? 'Metric Store' : 'Records' }}</span>
    </div>
  </div>
</template>
