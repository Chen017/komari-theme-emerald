<script setup lang="ts">
import type { TrafficRange } from './types'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useAppStore } from '@/stores/app'
import { formatBytes } from '@/utils/helper'
import { useTrafficTrend } from './useTrafficTrend'
import '@/utils/echarts'

const props = defineProps<{
  nodes: readonly NodeData[]
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const {
  selectedEntity,
  selectedRange,
  capability,
  trafficView,
  resetWindow,
  canUseCycle,
  cycleCumulative,
  refreshing,
  refresh,
} = useTrafficTrend({
  nodes: () => props.nodes,
})

const rangeOptions: Array<{ value: TrafficRange, label: string }> = [
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: 'cycle', label: '本周期' },
]

function getRangeTooltip(val: TrafficRange): string {
  if (val === 'cycle') {
    if (selectedEntity.value === 'all') {
      return '全部节点无法统一按重置日汇总'
    }
    if (!canUseCycle.value) {
      return '该节点未配置流量重置日\n可在节点 Tag 中添加 <TRD:18> 或 <TRD:18> <TRTZ:America/New_York>'
    }
    if (resetWindow.value) {
      const tzNote = resetWindow.value.isFallbackTimezone
        ? ' (未配置重置时区，当前按 Asia/Shanghai 计算)'
        : ` (${resetWindow.value.resetTimezone})`
      return `${resetWindow.value.resetStartText} – ${resetWindow.value.endDate} · 每月 ${resetWindow.value.resetDay} 日重置${tzNote}`
    }
    return '当前计费周期'
  }
  if (val === '30d') {
    if (capability.value && !capability.value.supports30d) {
      return `当前 Komari 仅保留 ${capability.value.retentionDays ?? 1} 天流量历史\n30 天趋势需要至少 30 天 Metric Store retention`
    }
    return '近 30 天每日流量趋势'
  }
  return '近 7 天每日流量趋势'
}

const coverageText = computed(() => {
  if (trafficView.value.state === 'loading' || trafficView.value.state === 'idle')
    return ''
  if (selectedRange.value === '30d') {
    return `历史覆盖 ${trafficView.value.availableDays} / 30 天`
  }
  if (selectedRange.value === 'cycle' && resetWindow.value) {
    return `历史覆盖 ${trafficView.value.availableDays} / ${resetWindow.value.diffDays} 天`
  }
  return ''
})

const chartOption = computed(() => {
  const days = trafficView.value.days
  const dates = days.map(d => d.date.slice(5))
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
          missing: '无数据',
        }
        const qualityText = qualityLabels[day.quality] || day.quality

        let html = `<div style="font-weight:600;margin-bottom:4px;">${day.date} (${qualityText}${day.isCoarse ? ' · 粗粒度' : ''})</div>`
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
  <!-- Card root ALWAYS stays mounted -->
  <div class="flex flex-col justify-between rounded-lg border border-border/70 bg-card/60 p-4 shadow-xs">
    <!-- Header -->
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:activity" class="size-4 text-emerald-600 dark:text-emerald-400" />
        <h2 class="text-sm font-semibold text-foreground">
          每日流量趋势
        </h2>
        <span
          v-if="capability && capability.retentionDays !== null && capability.retentionDays < 30"
          class="text-xs text-amber-600 dark:text-amber-400 font-normal"
          title="如需 30 天历史，请在 Komari Metric Store 中将 traffic.up / traffic.down 保留时间调整为至少 30 天"
        >
          (历史保留: {{ capability.retentionDays }}天)
        </span>
        <span
          v-if="selectedRange === 'cycle' && resetWindow"
          class="text-xs text-muted-foreground font-normal"
        >
          ({{ resetWindow.resetStartText }} – {{ resetWindow.endDate.slice(5) }} · 每月 {{ resetWindow.resetDay }} 日重置)
        </span>
        <span
          v-else-if="coverageText"
          class="text-xs text-muted-foreground font-normal"
        >
          ({{ coverageText }})
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

        <!-- Range Buttons: 7 天, 30 天, 本周期 -->
        <div class="flex items-center rounded-md bg-muted/60 p-0.5" role="group">
          <button
            v-for="opt in rangeOptions"
            :key="opt.value"
            type="button"
            :disabled="(opt.value === 'cycle' && !canUseCycle) || (opt.value === '30d' && capability !== null && !capability.supports30d)"
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
          :disabled="trafficView.state === 'loading' || refreshing"
          title="刷新流量数据"
          @click="refresh"
        >
          <Icon icon="lucide:refresh-cw" class="size-3.5" :class="refreshing ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- Cycle Cumulative Banner for 本周期 -->
    <div
      v-if="selectedRange === 'cycle' && cycleCumulative"
      class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-xs border border-border/40"
    >
      <div class="flex items-center gap-3">
        <span class="text-muted-foreground font-medium">本周期累计:</span>
        <span class="text-emerald-600 dark:text-emerald-400 font-semibold">↓ {{ formatBytes(cycleCumulative.down) }}</span>
        <span class="text-sky-600 dark:text-sky-400 font-semibold">↑ {{ formatBytes(cycleCumulative.up) }}</span>
        <span class="text-foreground font-bold">(总计 {{ formatBytes(cycleCumulative.total) }})</span>
      </div>
      <div class="flex items-center gap-2 text-muted-foreground text-[11px]">
        <span v-if="resetWindow">
          周期: {{ resetWindow.resetStartText }} → {{ resetWindow.endDate.slice(5) }}
          <span v-if="resetWindow.isFallbackTimezone" class="text-amber-600 dark:text-amber-400" title="未配置重置时区，当前按 Asia/Shanghai 计算">
            (Asia/Shanghai)
          </span>
          <span v-else-if="resetWindow.resetTimezone !== 'Asia/Shanghai'" class="opacity-75">
            ({{ resetWindow.resetTimezone }})
          </span>
        </span>
      </div>
    </div>

    <!-- Coarse Rollup Warning Notice -->
    <div
      v-if="trafficView.hasCoarseRollup"
      class="mb-3 px-3 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2"
    >
      <Icon icon="lucide:alert-triangle" class="w-3.5 h-3.5 shrink-0" />
      <span>{{ trafficView.coarseWarning || '存在跨越午夜的粗粒度历史聚合，无法精确切分' }}</span>
    </div>

    <!-- Body: only body changes depending on state -->
    <div class="relative min-h-64 w-full flex-1">
      <div v-if="trafficView.state === 'loading' && !refreshing" class="flex h-64 items-center justify-center">
        <Icon icon="lucide:loader-2" class="size-6 animate-spin text-emerald-600" />
      </div>

      <div
        v-else-if="trafficView.state === 'unsupported'"
        class="flex h-64 flex-col items-center justify-center text-xs text-amber-600 dark:text-amber-400"
      >
        <Icon icon="lucide:alert-circle" class="mb-2 size-8 opacity-60" />
        <p>{{ trafficView.message || '当前保留天数不足以展示 30 天历史' }}</p>
      </div>

      <div
        v-else-if="trafficView.state === 'error'"
        class="flex h-64 flex-col items-center justify-center text-xs text-destructive"
      >
        <Icon icon="lucide:alert-circle" class="mb-2 size-8 opacity-60" />
        <p>{{ trafficView.message || '流量数据加载失败' }}</p>
      </div>

      <div
        v-else-if="trafficView.state === 'empty' || trafficView.days.length === 0"
        class="flex h-64 flex-col items-center justify-center text-xs text-muted-foreground"
      >
        <Icon icon="lucide:bar-chart-2" class="mb-2 size-8 opacity-40" />
        <p>{{ trafficView.message || '暂无历史流量记录' }}</p>
      </div>

      <div v-else class="h-64 w-full">
        <VChart :option="chartOption" autoresize style="width: 100%; height: 100%;" />
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
      <span>{{ trafficView.message }}</span>
      <span>来源: Metric Store</span>
    </div>
  </div>
</template>
