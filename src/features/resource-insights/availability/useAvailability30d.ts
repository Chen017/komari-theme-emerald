import type { AvailabilityFleetView, AvailabilityLoadState, AvailabilityNodeView, AvailabilitySummaryResponse } from './types'
import type { NodeData } from '@/stores/nodes'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { AvailabilityPluginUnavailableError, fetchAvailabilitySummary } from './api'

export interface UseAvailability30dOptions {
  nodes: () => readonly NodeData[]
}

const REFRESH_INTERVAL_MS = 60 * 1000

export function formatCoverageDays(seconds: number): string {
  if (seconds <= 0) {
    return '未观测'
  }

  const days = seconds / 86400

  if (days < 1) {
    return '覆盖 <1 / 30 天'
  }

  return `覆盖 ${days.toFixed(1)} / 30 天`
}

export function useAvailability30d(options: UseAvailability30dOptions) {
  const loadState = ref<AvailabilityLoadState>('idle')
  const errorMessage = ref<string>('')
  const summaryResponse = ref<AvailabilitySummaryResponse | null>(null)
  let timerId: ReturnType<typeof setInterval> | null = null
  let abortController: AbortController | null = null

  async function loadData() {
    abortController?.abort()
    abortController = new AbortController()

    const currentNodes = options.nodes()
    const uuids = currentNodes.map(n => n.uuid).filter(Boolean)

    loadState.value = 'loading'
    errorMessage.value = ''

    try {
      const res = await fetchAvailabilitySummary({
        days: 30,
        uuids,
        signal: abortController.signal,
      })
      summaryResponse.value = res
      loadState.value = 'ready'
    }
    catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      if (err instanceof AvailabilityPluginUnavailableError) {
        loadState.value = 'unsupported'
        errorMessage.value = err.message
      }
      else if (err instanceof Error) {
        loadState.value = 'error'
        errorMessage.value = err.message
      }
      else {
        loadState.value = 'error'
        errorMessage.value = '未知在线率错误'
      }
    }
  }

  const fleetView = computed<AvailabilityFleetView>(() => {
    const currentNodes = options.nodes()
    const summaryNodes = summaryResponse.value?.nodes ?? []
    const summaryMap = new Map(summaryNodes.map(s => [s.uuid, s]))

    let totalOnlineSeconds = 0
    let totalTrackedSeconds = 0
    let coveredCount = 0

    const nodeViews: AvailabilityNodeView[] = currentNodes.map((node) => {
      const summary = summaryMap.get(node.uuid)
      const isLiveOnline = Boolean(node.online)

      if (!summary || summary.observableSeconds <= 0) {
        return {
          uuid: node.uuid,
          name: node.name,
          isLiveOnline,
          uptimeRatio: null,
          uptimeText: '--',
          coverageDays: 0,
          coverageText: '未观测',
          currentState: summary?.currentState ?? (isLiveOnline ? 'online' : 'offline'),
          outageCount: summary?.outageCount ?? 0,
          hasData: false,
        }
      }

      coveredCount += 1
      const observable = summary.onlineSeconds + summary.offlineSeconds
      if (observable > 0) {
        totalOnlineSeconds += summary.onlineSeconds
        totalTrackedSeconds += observable
      }

      const coverageDays = Number((summary.observableSeconds / 86400).toFixed(1))
      const rawUptimeRatio = summary.uptimeRatio

      // 样本覆盖太少时（覆盖 < 1 天）先不显示百分比，显示 --；覆盖 >= 1 天且 uptimeRatio 有效时开始显示实际在线率
      const hasSufficientData = summary.observableSeconds >= 86400 && rawUptimeRatio !== null
      const uptimeRatio = hasSufficientData ? rawUptimeRatio : null
      const uptimeText = hasSufficientData
        ? `${(rawUptimeRatio * 100).toFixed(2)}%`
        : '--'

      return {
        uuid: node.uuid,
        name: node.name,
        isLiveOnline,
        uptimeRatio,
        uptimeText,
        coverageDays,
        coverageText: formatCoverageDays(summary.observableSeconds),
        currentState: summary.currentState,
        outageCount: summary.outageCount,
        hasData: summary.observableSeconds > 0 && rawUptimeRatio !== null,
      }
    })

    // Fleet 统计：如果没有任何节点拥有 >= 1 天的观测历史，不展示 Fleet 百分比（显示 --）
    const hasMatureNode = nodeViews.some(n => n.coverageDays >= 1 && n.hasData)
    const fleetHasSufficientData = hasMatureNode && totalTrackedSeconds > 0

    const fleetUptimeRatio = fleetHasSufficientData
      ? totalOnlineSeconds / totalTrackedSeconds
      : null
    const fleetUptimeText = fleetUptimeRatio !== null
      ? `${(fleetUptimeRatio * 100).toFixed(2)}%`
      : '--'

    return {
      fleetUptimeRatio,
      fleetUptimeText,
      nodes: nodeViews,
      totalNodes: currentNodes.length,
      coveredNodes: coveredCount,
    }
  })

  function refresh() {
    return loadData()
  }

  watch(
    () => options.nodes().map(n => n.uuid).join(','),
    () => {
      loadData()
    },
  )

  onMounted(() => {
    loadData()
    timerId = setInterval(loadData, REFRESH_INTERVAL_MS)
  })

  onUnmounted(() => {
    abortController?.abort()
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  })

  return {
    state: loadState,
    errorMessage,
    fleetView,
    refresh,
  }
}
