import type {
  CycleCumulative,
  ResetWindow,
  TrafficCapability,
  TrafficRange,
  TrafficView,
} from './types'
import type { NodeData } from '@/stores/nodes'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { aggregateDailyTraffic } from './aggregate'
import { fetchTrafficCapability, fetchTrafficMetrics } from './api'
import {
  calculateResetWindow,
  getBeijingDates,
  getBeijingDayBounds,
  parseResetMetadata,
} from './calendar'

export interface UseTrafficTrendOptions {
  nodes: () => readonly NodeData[]
}

export function useTrafficTrend(options: UseTrafficTrendOptions) {
  const selectedEntity = ref<string>('all')
  const selectedRange = ref<TrafficRange>('7d')
  const capability = ref<TrafficCapability | null>(null)
  const refreshing = ref<boolean>(false)

  const trafficView = ref<TrafficView>({
    state: 'idle',
    days: [],
    message: '',
    retentionDays: null,
    requestedDays: 7,
    availableDays: 0,
  })

  let abortController: AbortController | null = null

  const selectedNode = computed<NodeData | null>(() => {
    if (selectedEntity.value === 'all')
      return null
    return options.nodes().find(n => n.uuid === selectedEntity.value) ?? null
  })

  const resetMetadata = computed(() => {
    if (!selectedNode.value)
      return null
    return parseResetMetadata(selectedNode.value.tags)
  })

  const canUseCycle = computed<boolean>(() => {
    return Boolean(selectedEntity.value !== 'all' && resetMetadata.value && resetMetadata.value.resetDay !== null)
  })

  const resetWindow = computed<ResetWindow | null>(() => {
    if (!canUseCycle.value || !resetMetadata.value || resetMetadata.value.resetDay === null) {
      return null
    }
    return calculateResetWindow(
      resetMetadata.value.resetDay,
      resetMetadata.value.resetTimezone,
      resetMetadata.value.isFallbackTimezone,
    )
  })

  const cycleCumulative = computed<CycleCumulative | null>(() => {
    if (!selectedNode.value)
      return null
    const up = Number(selectedNode.value.net_total_up ?? 0)
    const down = Number(selectedNode.value.net_total_down ?? 0)
    return {
      up,
      down,
      total: up + down,
    }
  })

  async function loadData(isManual = false) {
    abortController?.abort()
    abortController = new AbortController()
    const signal = abortController.signal

    if (isManual) {
      refreshing.value = true
    }
    else {
      trafficView.value = {
        ...trafficView.value,
        state: 'loading',
      }
    }

    try {
      if (capability.value === null) {
        capability.value = await fetchTrafficCapability()
      }

      // If cycle range is selected but not available for this node, switch to 7d
      if (selectedRange.value === 'cycle' && !canUseCycle.value) {
        selectedRange.value = '7d'
      }

      if (selectedRange.value === '30d' && !capability.value.supports30d) {
        trafficView.value = {
          state: 'unsupported',
          days: [],
          message: capability.value.retentionDays !== null
            ? `当前 Komari 仅保留 ${capability.value.retentionDays} 天流量历史`
            : '无法确定当前 Metric Store 的流量历史保留天数',
          retentionDays: capability.value.retentionDays,
          requestedDays: 30,
          availableDays: 0,
        }
        return
      }

      const dates = getBeijingDates(selectedRange.value, resetWindow.value)
      const requestedDays = dates.length

      let entityIds: string[]
      if (selectedEntity.value === 'all') {
        entityIds = options.nodes().map(n => n.uuid).filter(Boolean)
      }
      else {
        entityIds = [selectedEntity.value]
      }

      if (entityIds.length === 0) {
        trafficView.value = {
          state: 'empty',
          days: [],
          message: '暂无节点数据',
          retentionDays: capability.value.retentionDays,
          requestedDays,
          availableDays: 0,
        }
        return
      }

      const firstDate = dates[0]!
      const lastDate = dates.at(-1)!
      const startMs = getBeijingDayBounds(firstDate).startMs
      const endMs = getBeijingDayBounds(lastDate).endMs
      const maxPoints = Math.max(200, dates.length * 24 + 10)

      const series = await fetchTrafficMetrics({
        entityIds,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        maxPoints,
        signal,
      })

      const agg = aggregateDailyTraffic(dates, series)
      const availableDays = agg.days.filter(d => d.totalBytes !== null).length

      let state: TrafficView['state'] = 'ready'
      if (availableDays === 0) {
        state = 'empty'
      }
      else if (availableDays < requestedDays) {
        state = 'partial'
      }

      trafficView.value = {
        state,
        days: agg.days,
        message: availableDays === 0 ? '暂无历史流量记录' : (agg.coarseWarning ?? ''),
        retentionDays: capability.value.retentionDays,
        requestedDays,
        availableDays,
        hasCoarseRollup: agg.hasCoarseRollup,
        coarseWarning: agg.coarseWarning,
      }
    }
    catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      trafficView.value = {
        state: 'error',
        days: [],
        message: err instanceof Error ? err.message : '历史流量获取失败',
        retentionDays: capability.value?.retentionDays ?? null,
        requestedDays: 7,
        availableDays: 0,
      }
    }
    finally {
      refreshing.value = false
    }
  }

  function refresh() {
    return loadData(true)
  }

  watch([selectedEntity, selectedRange], () => {
    loadData()
  })

  watch(
    () => options.nodes().map(n => n.uuid).join(','),
    () => {
      loadData()
    },
  )

  onMounted(() => {
    loadData()
  })

  onUnmounted(() => {
    abortController?.abort()
  })

  return {
    selectedEntity,
    selectedRange,
    selectedNode,
    capability,
    trafficView,
    resetWindow,
    canUseCycle,
    cycleCumulative,
    refreshing,
    refresh,
  }
}
