import type { NodeData } from '@/stores/nodes'
import type { FleetUptime30d } from '../services/uptime'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { getSharedRpc } from '@/utils/rpc'
import { createHistoryGateway } from '../services/historyGateway'
import { calculateFleet30dUptime } from '../services/uptime'

export interface UseUptime30dOptions {
  nodes: () => readonly NodeData[]
}

export function useUptime30d(options: UseUptime30dOptions) {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const gateway = createHistoryGateway((method, params, opts) => {
    return getSharedRpc().call(method, params, opts)
  })

  const fleetUptime = shallowRef<FleetUptime30d>({
    fleetUptimeRatio: null,
    fleetUptimeText: '--',
    nodes: [],
    totalNodes: 0,
    completeNodes: 0,
    partialNodes: 0,
    unavailableNodes: 0,
  })

  async function fetchUptime() {
    const nodes = options.nodes()
    if (nodes.length === 0) {
      fleetUptime.value = {
        fleetUptimeRatio: null,
        fleetUptimeText: '--',
        nodes: [],
        totalNodes: 0,
        completeNodes: 0,
        partialNodes: 0,
        unavailableNodes: 0,
      }
      return
    }

    loading.value = true
    error.value = null

    try {
      const now = new Date()
      const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()
      const end = now.toISOString()

      const entityIds = nodes.map(n => n.uuid)
      const res = await gateway.queryUptime({ entityIds, start, end })

      if (res.kind === 'metrics') {
        const seriesByNode: Record<string, any> = {}
        for (const s of res.series) {
          seriesByNode[s.entityId] = s
        }
        fleetUptime.value = calculateFleet30dUptime(nodes, { kind: 'metrics', seriesByNode }, now)
      }
      else {
        fleetUptime.value = calculateFleet30dUptime(nodes, { kind: 'records', recordsByNode: res.records }, now)
      }
    }
    catch (err: any) {
      error.value = err instanceof Error ? err.message : String(err)
      fleetUptime.value = calculateFleet30dUptime(nodes, { kind: 'records', recordsByNode: {} }, new Date())
    }
    finally {
      loading.value = false
    }
  }

  // Watch node list and state transitions (e.g. online -> offline, heartbeat updates)
  const nodesSignature = computed(() => {
    return options.nodes().map(n => `${n.uuid}:${n.online}:${n.updated_at || n.time}`).join(';')
  })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(nodesSignature, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void fetchUptime()
    }, 1500)
  }, { immediate: true })

  let intervalId: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    intervalId = setInterval(() => {
      void fetchUptime()
    }, 60000)
  })

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (intervalId) clearInterval(intervalId)
  })

  return {
    fleetUptime,
    loading,
    error,
    refresh: fetchUptime,
  }
}
