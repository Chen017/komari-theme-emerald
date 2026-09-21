import type { NodeData } from '@/stores/nodes'
import type { TrafficRange, TrafficTrendSnapshot } from '../services/trafficTrend'
import { computed, ref, shallowRef, watch } from 'vue'
import { getSharedRpc } from '@/utils/rpc'
import { createHistoryGateway } from '../services/historyGateway'
import {
  aggregateDailyTraffic,
  buildRecentNaturalDayKeys,
  type DailyTrafficAggregate,
} from '../services/trafficAggregator'
import { buildTrafficTrendViewModel, canRequestSinceReset } from '../services/trafficTrend'
import {
  buildTrafficTrendCacheKey,
  readTrafficTrendCache,
  writeTrafficTrendCache,
} from '../services/trafficTrendCache'
import { historyResultToTrafficEvidence } from '../services/trafficEvidence'
import { createTrafficTrendRequestPool } from '../services/trafficTrendRequestPool'

const requestPool = createTrafficTrendRequestPool<DailyTrafficAggregate[]>()

export interface UseTrafficTrendOptions {
  nodes: () => readonly NodeData[]
}

export function useTrafficTrend(options: UseTrafficTrendOptions) {
  const selectedEntity = ref<string>('all')
  const selectedRange = ref<TrafficRange>('7d')
  const loading = ref(false)
  const refreshing = ref(false)

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
    return canRequestSinceReset(selectedEntity.value, selectedNode.value)
  })

  // Determine dates based on range
  const dates = computed(() => {
    const dayCount = selectedRange.value === '30d' ? 30 : 7
    return buildRecentNaturalDayKeys(dayCount, 'browser')
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
      timeZone: 'browser',
      dates: dates.value,
      schema: 1,
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
      const startDate = dates.value[0]!
      const endDate = dates.value.at(-1)!
      const startMs = Date.parse(`${startDate}T00:00:00`)
      const endMs = Date.parse(`${endDate}T23:59:59.999`)

      const lease = requestPool.acquire(cacheKey, async (signal) => {
        const result = await gateway.queryTraffic({
          entityIds,
          start: `${startDate}T00:00:00Z`,
          end: `${endDate}T23:59:59Z`,
          signal,
        })

        const evidence = historyResultToTrafficEvidence(result, { startMs, endMs })
        const byEntity = new Map<string, DailyTrafficAggregate[]>()

        for (const item of evidence) {
          const aggregates = aggregateDailyTraffic({
            timeZone: 'browser',
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
          retentionDays: result.kind === 'metrics' ? result.retentionDays : null,
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
    loading,
    refreshing,
    selectedEntity,
    selectedRange,
    canUseSinceReset,
    refresh: () => fetchTrend(true),
  }
}
