import type { NodeData } from '@/stores/nodes'
import type { HistoryFailureKind } from '../services/historyErrorPolicy'
import type { ResourceHistoryCapabilities } from '../services/historyCapabilities'
import type { DailyTrafficAggregate } from '../services/trafficAggregator'
import type { TrafficRange, TrafficTrendSnapshot } from '../services/trafficTrend'
import { computed, ref, shallowRef, watch } from 'vue'
import { getSharedRpc } from '../../../utils/rpc'
import { fetchHistoryCapabilities } from '../services/historyCapabilities'
import { createHistoryGateway } from '../services/historyGateway'
import {
  aggregateDailyTraffic,
  buildInclusiveDateRange,
  buildRecentNaturalDayKeys,
  calculateResetWindow,
} from '../services/trafficAggregator'
import { resolveTrafficHistory } from '../services/trafficHistoryQuery'
import {
  buildTrafficTrendViewModel,
  canRequestSinceReset,
  resolveNodeResetConfig,
} from '../services/trafficTrend'
import { buildTrafficTrendCacheKey, readTrafficTrendCache, writeTrafficTrendCache } from '../services/trafficTrendCache'
import { createTrafficTrendRequestPool } from '../services/trafficTrendRequestPool'

const TIME_ZONE = 'Asia/Shanghai'
const requestPool = createTrafficTrendRequestPool()

export interface UseTrafficTrendOptions {
  nodes: () => readonly NodeData[]
  settings?: () => any
}

export function useTrafficTrend(options: UseTrafficTrendOptions) {
  const selectedEntity = ref<string>('all')
  const selectedRange = ref<TrafficRange>('7d')
  const loading = ref(false)
  const refreshing = ref(false)
  const capabilities = shallowRef<ResourceHistoryCapabilities | null>(null)

  const gateway = createHistoryGateway((method, params, opts) => {
    return getSharedRpc().call(method, params, opts)
  })

  const targetEntityIds = computed(() => {
    if (selectedEntity.value === 'all')
      return options.nodes().map(n => n.uuid)
    return [selectedEntity.value]
  })

  const selectedNode = computed(() => {
    if (selectedEntity.value === 'all')
      return null
    return options.nodes().find(n => n.uuid === selectedEntity.value) ?? null
  })

  const canUseSinceReset = computed(() => {
    return canRequestSinceReset(selectedEntity.value, selectedNode.value, options.settings?.())
  })
  const canUseCycle = canUseSinceReset

  const resetConfig = computed(() => {
    if (!selectedNode.value) return null
    return resolveNodeResetConfig(selectedNode.value, options.settings?.())
  })

  const resetWindow = computed(() => {
    if (!resetConfig.value || !resetConfig.value.day) return null
    const res = calculateResetWindow(
      resetConfig.value.day,
      new Date(),
      resetConfig.value.timezone || TIME_ZONE,
      undefined,
      TIME_ZONE,
    )
    return {
      ...res,
      isFallbackTimezone: resetConfig.value.timezoneSource === 'fallback',
      resetTimezone: resetConfig.value.timezone || TIME_ZONE,
    }
  })

  // Prioritize Agent's own cycle cumulative traffic (net_total_up / net_total_down)
  const cycleCumulative = computed(() => {
    if (!selectedNode.value) return null
    const node = selectedNode.value
    const hasAgentTotals = typeof node.net_total_up === 'number' || typeof node.net_total_down === 'number'
    if (hasAgentTotals) {
      const up = node.net_total_up ?? 0
      const down = node.net_total_down ?? 0
      return {
        up,
        down,
        total: up + down,
        source: 'agent' as const,
      }
    }
    return null
  })

  // Fallback to 7d if cycle is no longer supported for selected node
  watch(canUseSinceReset, (canUse) => {
    if (!canUse && (selectedRange.value === 'since_reset' || selectedRange.value === 'current_cycle' || selectedRange.value === 'cycle')) {
      selectedRange.value = '7d'
    }
  })

  // Fallback to 7d if 30d is selected but server retention is under 30 days
  watch(() => capabilities.value?.trafficRetentionDays, (retention) => {
    if (typeof retention === 'number' && retention < 30 && selectedRange.value === '30d') {
      selectedRange.value = '7d'
    }
  })

  // Determine dates based on range
  const dates = computed(() => {
    if (selectedRange.value === 'since_reset' || selectedRange.value === 'current_cycle' || selectedRange.value === 'cycle') {
      if (resetWindow.value) {
        return buildInclusiveDateRange(resetWindow.value.startDate, resetWindow.value.endDate)
      }
      return buildRecentNaturalDayKeys(7, TIME_ZONE)
    }
    const dayCount = selectedRange.value === '30d' ? 30 : 7
    return buildRecentNaturalDayKeys(dayCount, TIME_ZONE)
  })

  const snapshot = shallowRef<TrafficTrendSnapshot>({
    state: 'idle',
    days: [],
    fetchedAt: null,
    sourceKind: null,
    retentionDays: null,
    availability: 'available',
    failureKind: null,
    retryable: true,
    message: '',
  })

  let requestGeneration = 0
  let activeLease: { release: () => void } | null = null

  const trafficView = computed(() => {
    const days = snapshot.value.days
    const state = loading.value && !refreshing.value
      ? 'loading'
      : snapshot.value.state

    const coarseDays = days.filter(d => d.reasons?.includes('cross-day-interval-rejected') || d.isCoarse)
    const coarseCount = coarseDays.length
    const totalDays = days.length
    const hasCoarseRollup = coarseCount > 0 || snapshot.value.capability === 'coarse-rollup'

    let coarseWarning: string | null = null
    if (hasCoarseRollup) {
      const isOldestPrefix = coarseDays.length > 0 && days.slice(0, coarseDays.length).every(d => d.reasons?.includes('cross-day-interval-rejected') || d.isCoarse)
      const prefixText = isOldestPrefix ? `最早 ${coarseCount} 天` : `其中 ${coarseCount} 天`
      if (coarseCount > 0 && coarseCount < totalDays) {
        const exactCount = days.filter(d => (d.quality === 'complete' || d.quality === 'partial') && !d.isCoarse && !d.queryFailed).length
        coarseWarning = `${prefixText}仅有粗粒度历史，无法精确按北京时间自然日拆分；其余 ${exactCount} 天已使用细粒度数据展示`
      }
      else {
        coarseWarning = '历史数据仅剩粗粒度聚合，无法精确按北京时间自然日拆分'
      }
    }

    return {
      state,
      days: snapshot.value.days,
      availableDays: snapshot.value.availableDays ?? snapshot.value.days.filter(d => d.totalBytes !== null).length,
      message: snapshot.value.message,
      hasCoarseRollup,
      coarseWarning,
      sourceKind: snapshot.value.sourceKind ?? 'metrics',
    }
  })

  const capability = computed(() => {
    return {
      retentionDays: capabilities.value?.trafficRetentionDays ?? null,
      supports30d: capabilities.value?.supports30dTraffic ?? null,
    }
  })

  async function fetchTrend(isManualRefresh = false) {
    const generation = ++requestGeneration
    const entityIds = targetEntityIds.value
    if (entityIds.length === 0) {
      if (activeLease) {
        activeLease.release()
        activeLease = null
      }
      snapshot.value = {
        state: 'empty',
        days: [],
        fetchedAt: Date.now(),
        sourceKind: null,
        retentionDays: null,
        availability: 'available',
        failureKind: null,
        retryable: false,
        message: '暂无节点',
      }
      return
    }

    const cacheKey = buildTrafficTrendCacheKey({
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      loggedIn: false,
      entityIds,
      range: selectedRange.value,
      timeZone: TIME_ZONE,
      dates: dates.value,
      schema: 3,
      capabilityVersion: 3,
    })

    if (!isManualRefresh && typeof localStorage !== 'undefined') {
      const cached = readTrafficTrendCache(localStorage, cacheKey)
      if (cached) {
        if (generation !== requestGeneration) return
        if (activeLease) {
          activeLease.release()
          activeLease = null
        }
        snapshot.value = cached
        return
      }
    }

    if (isManualRefresh)
      refreshing.value = true
    else
      loading.value = true

    let lease: any = null
    try {
      try {
        const fetchedCaps = await fetchHistoryCapabilities(
          (method, params, opts) => getSharedRpc().call(method, params, opts),
          { bypassCache: isManualRefresh },
        )
        if (generation === requestGeneration) {
          capabilities.value = fetchedCaps
        }
      }
      catch {
        // Continue even if capabilities probe fails
      }

      if (generation !== requestGeneration) return

      if (activeLease) {
        activeLease.release()
        activeLease = null
      }

      lease = requestPool.acquire(cacheKey, async (signal) => {
        const resolved = await resolveTrafficHistory({
          gateway,
          entityIds,
          dates: dates.value,
          timeZone: TIME_ZONE,
          nowMs: Date.now(),
          signal,
        })

        if (resolved.failedWindows.length > 0 && resolved.evidence.length === 0) {
          const builtSnapshot: TrafficTrendSnapshot = {
            state: 'error',
            days: [],
            fetchedAt: Date.now(),
            sourceKind: null,
            retentionDays: null,
            availability: 'available',
            failureKind: 'rpc-error',
            retryable: true,
            message: '历史流量获取失败',
          }
          return builtSnapshot as any
        }

        const byEntity = new Map<string, DailyTrafficAggregate[]>()

        for (const item of resolved.evidence) {
          const aggregates = aggregateDailyTraffic({
            timeZone: TIME_ZONE,
            dates: dates.value,
            deltas: item.deltas,
            counters: item.counters,
          })
          byEntity.set(item.entityId, aggregates)
        }

        const vm = buildTrafficTrendViewModel(byEntity, dates.value, entityIds, {
          coarseDates: resolved.coarseDates,
          failedDates: resolved.failedDates,
        })
        const builtSnapshot: TrafficTrendSnapshot = {
          state: vm.state,
          days: vm.days,
          fetchedAt: Date.now(),
          sourceKind: resolved.sourceKind,
          retentionDays: resolved.retentionDays ?? (capabilities.value?.trafficRetentionDays ?? null),
          requestedDays: vm.requestedDays,
          availableDays: vm.availableDays,
          capability: vm.capability,
          availability: 'available',
          failureKind: null,
          retryable: true,
          message: vm.message,
        }

        // Only persist if there were no transient segment failures
        if (resolved.failedWindows.length === 0 && typeof localStorage !== 'undefined')
          writeTrafficTrendCache(localStorage, cacheKey, builtSnapshot)

        return builtSnapshot as any
      })
      activeLease = lease

      const res = await lease.promise
      if (generation !== requestGeneration) return
      snapshot.value = res as unknown as TrafficTrendSnapshot
    }
    catch (err: any) {
      if (generation !== requestGeneration) return
      snapshot.value = {
        state: 'error',
        days: [],
        fetchedAt: Date.now(),
        sourceKind: null,
        retentionDays: null,
        availability: 'available',
        failureKind: 'rpc-error',
        retryable: true,
        message: err instanceof Error ? err.message : '历史流量获取失败',
      }
    }
    finally {
      if (generation === requestGeneration) {
        loading.value = false
        refreshing.value = false
        if (activeLease === lease) {
          lease?.release?.()
          activeLease = null
        }
      }
    }
  }

  watch([selectedEntity, selectedRange, () => options.nodes().length], () => {
    void fetchTrend()
  }, { immediate: true })

  return {
    snapshot,
    trafficView,
    loading,
    refreshing,
    selectedEntity,
    selectedRange,
    selectedNode,
    canUseCycle,
    canUseSinceReset,
    resetWindow,
    cycleCumulative,
    capability,
    capabilities,
    refresh: () => fetchTrend(true),
  }
}
