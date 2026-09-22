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
import { historyResultToTrafficEvidence } from '../services/trafficEvidence'
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

  const trafficView = computed(() => {
    const hasCoarseRollup = snapshot.value.days.some(d => d.reasons?.includes('cross-day-interval-rejected') || d.isCoarse) || snapshot.value.capability === 'coarse-rollup'
    const coarseWarning = hasCoarseRollup ? '存在跨越午夜的粗粒度历史聚合，无法精确切分' : null

    return {
      state: snapshot.value.state,
      days: snapshot.value.days,
      availableDays: snapshot.value.availableDays ?? snapshot.value.days.filter(d => d.totalBytes !== null).length,
      message: snapshot.value.message,
      hasCoarseRollup,
      coarseWarning,
    }
  })

  const capability = computed(() => {
    return {
      retentionDays: capabilities.value?.trafficRetentionDays ?? null,
      supports30d: capabilities.value?.supports30dTraffic ?? false,
    }
  })

  async function fetchTrend(isManualRefresh = false) {
    const entityIds = targetEntityIds.value
    if (entityIds.length === 0) {
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
      schema: 2,
      capabilityVersion: 2,
    })

    if (!isManualRefresh && typeof localStorage !== 'undefined') {
      const cached = readTrafficTrendCache(localStorage, cacheKey)
      if (cached) {
        snapshot.value = cached
        return
      }
    }

    if (isManualRefresh)
      refreshing.value = true
    else
      loading.value = true

    try {
      try {
        capabilities.value = await fetchHistoryCapabilities(
          (method, params, opts) => getSharedRpc().call(method, params, opts),
          { bypassCache: isManualRefresh },
        )
      }
      catch {
        // Continue even if capabilities probe fails
      }

      const startDate = dates.value[0]!
      const endDate = dates.value.at(-1)!
      const startMs = Date.parse(`${startDate}T00:00:00+08:00`)
      const endMs = Date.parse(`${endDate}T23:59:59.999+08:00`)

      const lease = requestPool.acquire(cacheKey, async (signal) => {
        const queryStart = new Date(startMs - 86400000).toISOString()
        const queryEnd = new Date(endMs + 86400000).toISOString()
        const maxPoints = selectedRange.value === '7d' ? 240 : 800

        const result = await gateway.queryTraffic({
          entityIds,
          start: queryStart,
          end: queryEnd,
          maxPoints,
          signal,
        })

        if (result.kind === 'unavailable') {
          const failureMessage = result.reason === 'metrics-unsupported'
            ? '当前服务不支持历史流量指标'
            : result.reason === 'retention-insufficient'
              ? '历史保留时长不足'
              : result.reason === 'no-data'
                ? '暂无历史流量数据'
                : '历史流量获取失败'
          const availability = result.reason === 'retention-insufficient'
            ? 'retention-insufficient'
            : 'available'
          const failureKind: HistoryFailureKind = result.reason === 'metrics-unsupported'
            ? 'unsupported'
            : 'rpc-error'
          const builtSnapshot: TrafficTrendSnapshot = {
            state: 'error',
            days: [],
            fetchedAt: Date.now(),
            sourceKind: null,
            retentionDays: null,
            availability,
            failureKind,
            retryable: true,
            message: failureMessage,
          }
          return builtSnapshot as any
        }

        const evidence = historyResultToTrafficEvidence(result, {
          startMs: startMs - 86400000,
          endMs: endMs + 86400000,
        })
        const byEntity = new Map<string, DailyTrafficAggregate[]>()

        for (const item of evidence) {
          const aggregates = aggregateDailyTraffic({
            timeZone: TIME_ZONE,
            dates: dates.value,
            deltas: item.deltas,
            counters: item.counters,
          })
          byEntity.set(item.entityId, aggregates)
        }

        const vm = buildTrafficTrendViewModel(byEntity, dates.value, entityIds)
        const builtSnapshot: TrafficTrendSnapshot = {
          state: vm.state,
          days: vm.days,
          fetchedAt: Date.now(),
          sourceKind: result.kind === 'metrics' ? 'metrics' : 'records',
          retentionDays: result.kind === 'metrics' ? result.retentionDays : (capabilities.value?.trafficRetentionDays ?? null),
          requestedDays: vm.requestedDays,
          availableDays: vm.availableDays,
          capability: vm.capability,
          availability: 'available',
          failureKind: null,
          retryable: true,
          message: vm.message,
        }

        if (typeof localStorage !== 'undefined')
          writeTrafficTrendCache(localStorage, cacheKey, builtSnapshot)

        return builtSnapshot as any
      })

      const res = await lease.promise
      snapshot.value = res as unknown as TrafficTrendSnapshot
    }
    catch (err: any) {
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
      loading.value = false
      refreshing.value = false
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
